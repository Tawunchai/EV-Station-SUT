package ocpp

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
)

// ============================================================================
// ✅ LOG SWITCH (open/close) - ไม่กระทบ logic ระบบ
// ============================================================================
// 1 = open, 0 = close
var logEnabled uint32 = 1

func isLogEnabled() bool { return atomic.LoadUint32(&logEnabled) == 1 }

func setLogEnabled(v bool) {
	if v {
		atomic.StoreUint32(&logEnabled, 1)
	} else {
		atomic.StoreUint32(&logEnabled, 0)
	}
}

// ============================================================================
// ✅ LOG FILTER: พิมพ์เฉพาะ “กลุ่ม log ที่ต้องการ” เท่านั้น
// ============================================================================

type LogKind string

const (
	LogConnect  LogKind = "connect"  // 🚗 Charger connected
	LogCall     LogKind = "call"     // 📥 CALL action=...
	LogBoot     LogKind = "boot"     // 🔌 Boot... / ✅ Boot...
	LogStatus   LogKind = "status"   // 📥 StatusNotification... / ✅ stored...
	LogMeter    LogKind = "meter"    // 📊 MeterValues from... / 📊 Acknowledged
	LogStopTx   LogKind = "stop_tx"  // 🛑 StopTransaction... / 🧹 cleared...
	LogHeartbeat LogKind = "hb"      // 💓 Heartbeat Answered
)

// ✅ เปิดเฉพาะ log ที่คุณยกตัวอย่างมาเท่านั้น
func allowLogKind(k LogKind) bool {
	switch k {
	case LogConnect, LogCall, LogBoot, LogStatus, LogMeter, LogStopTx, LogHeartbeat:
		return true
	default:
		return false
	}
}

func loglnK(k LogKind, args ...interface{}) {
	if !isLogEnabled() || !allowLogKind(k) {
		return
	}
	fmt.Println(args...)
}

func logfK(k LogKind, format string, args ...interface{}) {
	if !isLogEnabled() || !allowLogKind(k) {
		return
	}
	fmt.Printf(format, args...)
}

func broadcastLogTextToFrontendRoomK(k LogKind, roomID, s string) {
	if !isLogEnabled() || !allowLogKind(k) {
		return
	}
	broadcastToFrontendRoom(roomID, []byte(s))
}

// ============================================================================
// 🔧 WebSocket Upgrader (OCPP 1.6J ใช้ subprotocol "ocpp1.6")
// ============================================================================
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	Subprotocols: []string{"ocpp1.6"},
}

// ============================================================================
// 🌐 Frontend WebSocket Clients (ดู log OCPP แบบ real-time แยกตามตู้)
// ============================================================================
var (
	frontendClients   = make(map[*websocket.Conn]string) // conn -> roomID
	frontendClientsMu sync.Mutex
)

// ============================================================================
// 🔌 Charger WebSocket Connections
// ============================================================================
var (
	chargers   = make(map[string]*websocket.Conn)
	chargersMu sync.Mutex
)

// ============================================================================
// 🔢 Transaction ID Storage (ใช้สำหรับ RemoteStop)
// ============================================================================
var (
	transactionIDs    = make(map[string]int) // active session ต่อ charger
	nextTransactionID = 1                    // auto-increment
	txMu              sync.Mutex
)

// ============================================================================
// ⭐ โครงสร้างเก็บสถานะล่าสุดของแต่ละตู้
// ============================================================================
type ChargerStatus struct {
	ChargerID     string    `json:"chargerId"`
	ConnectorID   int       `json:"connectorId"`
	Status        string    `json:"status"`
	ErrorCode     string    `json:"errorCode"`
	Connected     bool      `json:"connected"`
	LastHeartbeat time.Time `json:"lastHeartbeat"`
}

var (
	chargerStatuses = make(map[string]ChargerStatus)
	statusMu        sync.Mutex
)

// ============================================================================
// 🧾 Pending Calls (สำหรับจับคู่ CALLRESULT / CALLERROR จากตู้)
// ============================================================================
type PendingCall struct {
	ChargerID string
	Action    string
	SentAt    time.Time
}

var (
	pendingCalls = make(map[string]PendingCall) // messageId -> PendingCall
	pendingMu    sync.Mutex
)

// ============================================================================
// 🛑 Guard: กัน AutoStop ยิงซ้ำต่อ session
// ============================================================================
var (
	autoStoppedSessions   = make(map[uint]bool) // sessionID -> true
	autoStoppedSessionsMu sync.Mutex
)

func markAutoStopped(sessionID uint) bool {
	autoStoppedSessionsMu.Lock()
	defer autoStoppedSessionsMu.Unlock()

	if sessionID == 0 {
		return false
	}
	if autoStoppedSessions[sessionID] {
		return false
	}
	autoStoppedSessions[sessionID] = true
	return true
}

// ============================================================================
// 🧮 Helper: สร้าง transaction id ไม่ซ้ำ
// ============================================================================
func generateTransactionID() int {
	txMu.Lock()
	defer txMu.Unlock()

	id := nextTransactionID
	nextTransactionID++
	return id
}

func saveTransactionID(chargerID string, tx int) {
	txMu.Lock()
	transactionIDs[chargerID] = tx
	txMu.Unlock()
}

func getTransactionID(chargerID string) (int, bool) {
	txMu.Lock()
	defer txMu.Unlock()
	tx, ok := transactionIDs[chargerID]
	return tx, ok
}

func clearTransactionID(chargerID string) {
	txMu.Lock()
	delete(transactionIDs, chargerID)
	txMu.Unlock()
}

// ============================================================================
// 🧰 Helper: เวลาแบบ RFC3339 UTC (ตามสเปก OCPP)
// ============================================================================
func nowOcppTime() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// ============================================================================
// 📡 Broadcast log / msg ไป frontend (room-based)
// ============================================================================
func broadcastToFrontendRoom(roomID string, msg []byte) {
	frontendClientsMu.Lock()
	defer frontendClientsMu.Unlock()

	for conn, r := range frontendClients {
		if roomID == "*" || r == "*" || r == roomID {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				conn.Close()
				delete(frontendClients, conn)
			}
		}
	}
}

// กัน unused ได้ (ถ้าวันไหนไม่ได้เรียกใช้)
var _ = broadcastTextToFrontendRoom

func broadcastTextToFrontendRoom(roomID, s string) {
	broadcastToFrontendRoom(roomID, []byte(s))
}

// ============================================================================
// 🔹 FRONTEND WebSocket (ดู log OCPP real-time) + ✅ command open/close
// ============================================================================
// พิมพ์ "open" เพื่อเปิด log, "close" เพื่อปิด log
func HandleFrontend(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	roomID := c.Param("chargerID")
	if roomID == "" || roomID == "all" {
		roomID = "*"
	}

	frontendClientsMu.Lock()
	frontendClients[conn] = roomID
	frontendClientsMu.Unlock()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			frontendClientsMu.Lock()
			delete(frontendClients, conn)
			frontendClientsMu.Unlock()
			break
		}

		cmd := strings.ToLower(strings.TrimSpace(string(msg)))
		switch cmd {
		case "open":
			setLogEnabled(true)
			_ = conn.WriteMessage(websocket.TextMessage, []byte("[LOG] open\n"))
			continue
		case "close":
			setLogEnabled(false)
			// ปิด log ทั้งหมด -> ไม่ส่ง ack เพิ่ม
			continue
		default:
			// ignore
		}
	}
}

// ============================================================================
// 🔹 CHARGER OCPP WebSocket (ตัวหลักคุยกับตู้จริง OCPP 1.6J)
// ============================================================================

// HandleOCPP: ws://host/ocpp/:chargerID
func HandleOCPP(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	chargerID := c.Param("chargerID")

	chargersMu.Lock()
	chargers[chargerID] = conn
	chargersMu.Unlock()

	// ✅ เอาแค่ log ที่ต้องการ
	loglnK(LogConnect, "🚗 Charger connected:", chargerID)
	broadcastLogTextToFrontendRoomK(LogConnect, chargerID, "[SYSTEM] Charger connected: "+chargerID+"\n")

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}
	st.Connected = true
	st.LastHeartbeat = time.Now().UTC()
	chargerStatuses[chargerID] = st
	statusMu.Unlock()

	defer func() {
		chargersMu.Lock()
		delete(chargers, chargerID)
		chargersMu.Unlock()

		// ❌ ไม่พิมพ์ “disconnected” ตามที่คุณไม่ต้องการ
		statusMu.Lock()
		st, ok := chargerStatuses[chargerID]
		if ok {
			st.Connected = false
			chargerStatuses[chargerID] = st
		}
		statusMu.Unlock()
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		// ✅ raw OCPP frame ถือเป็น log (ปิดได้) แต่ “ไม่พิมพ์อะไรเพิ่ม” นอกจากรายการที่คุณต้องการ
		// ถ้าต้องการให้ frontend เห็น raw frame เฉพาะตอน open ก็ยังส่งได้:
		if isLogEnabled() {
			broadcastToFrontendRoom(chargerID, msg)
		}

		var frame []interface{}
		if err := json.Unmarshal(msg, &frame); err != nil {
			continue
		}
		if len(frame) < 3 {
			continue
		}

		messageTypeFloat, ok := frame[0].(float64)
		if !ok {
			continue
		}
		messageType := int(messageTypeFloat)

		messageID, ok := frame[1].(string)
		if !ok {
			continue
		}

		switch messageType {
		case 2:
			handleCallFromCharger(chargerID, conn, frame, messageID)
		case 3:
			handleCallResultFromCharger(chargerID, frame, messageID)
		case 4:
			handleCallErrorFromCharger(chargerID, frame, messageID)
		default:
		}
	}
}

// ============================================================================
// 🧠 Handlers: CALL / CALLRESULT / CALLERROR
// ============================================================================
func handleCallFromCharger(chargerID string, conn *websocket.Conn, frame []interface{}, messageID string) {
	action := ""
	if a, ok := frame[2].(string); ok {
		action = a
	}

	var payload map[string]interface{}
	if len(frame) >= 4 {
		if p, ok := frame[3].(map[string]interface{}); ok {
			payload = p
		}
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}

	// ✅ ต้องการ: “📥 CALL from ... action=... payload=...”
	logfK(LogCall, "📥 CALL from %s: action=%s payload=%v\n", chargerID, action, payload)

	switch action {

	case "BootNotification":
		vendor, _ := payload["chargePointVendor"].(string)
		model, _ := payload["chargePointModel"].(string)

		// ✅ ต้องการ: “🔌 BootNotification ...”
		logfK(LogBoot, "🔌 BootNotification from %s | Vendor=%s Model=%s\n", chargerID, vendor, model)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"status":      "Accepted",
				"currentTime": nowOcppTime(),
				"interval":    30,
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			// ❌ ไม่พิมพ์ error
		} else {
			// ✅ ต้องการ: “✅ BootNotification Accepted ...”
			loglnK(LogBoot, "✅ BootNotification Accepted for", chargerID)
		}

	case "Heartbeat":
		statusMu.Lock()
		st, ok := chargerStatuses[chargerID]
		if !ok {
			st = ChargerStatus{ChargerID: chargerID}
		}
		st.LastHeartbeat = time.Now().UTC()
		st.Connected = true
		chargerStatuses[chargerID] = st
		statusMu.Unlock()

		response := []interface{}{3, messageID, map[string]interface{}{"currentTime": nowOcppTime()}}

		if err := conn.WriteJSON(response); err != nil {
			// ❌ ไม่พิมพ์ error
		} else {
			// ✅ ต้องการ: “💓 Heartbeat Answered ...”
			loglnK(LogHeartbeat, "💓 Heartbeat Answered for", chargerID)
		}

	case "Authorize":
		// (ไม่อยู่ใน log ที่คุณขอ) -> ไม่พิมพ์
		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status": "Accepted",
				},
			},
		}
		_ = conn.WriteJSON(response)

	case "StatusNotification":
		// ✅ ต้องการ: “📥 StatusNotification from ...”
		loglnK(LogStatus, "📥 StatusNotification from", chargerID)

		var connectorID int
		var statusStr, errorCode string

		if cid, ok := payload["connectorId"].(float64); ok {
			connectorID = int(cid)
		}
		if s, ok := payload["status"].(string); ok {
			statusStr = s
		}
		if e, ok := payload["errorCode"].(string); ok {
			errorCode = e
		}

		statusMu.Lock()
		old := chargerStatuses[chargerID]
		newSt := ChargerStatus{
			ChargerID:     chargerID,
			ConnectorID:   connectorID,
			Status:        statusStr,
			ErrorCode:     errorCode,
			Connected:     true,
			LastHeartbeat: time.Now().UTC(),
		}
		if old.ChargerID != "" && newSt.ConnectorID == 0 {
			newSt.ConnectorID = old.ConnectorID
		}
		chargerStatuses[chargerID] = newSt
		statusMu.Unlock()

		response := []interface{}{3, messageID, map[string]interface{}{}}
		_ = conn.WriteJSON(response)

		// ✅ ต้องการ: “✅ StatusNotification stored: {...}”
		logfK(LogStatus, "✅ StatusNotification stored: %+v\n", newSt)

		// logic เดิม (ไม่พิมพ์ error)
		if statusStr == "SuspendedEV" {
			dbConn := config.DB()
			_ = updateEndTimeOnSuspendedEVByChargePoint(dbConn, chargerID)
		}

		// logic เดิม (ไม่พิมพ์ error)
		if statusStr == "Finishing" || statusStr == "Faulted" {
			dbConn := config.DB()
			_ = updateEndTimeAndCloseOnFinishingByChargePoint(dbConn, chargerID)
		}

	case "StartTransaction":
		// (ไม่อยู่ใน log ที่คุณขอ) -> ไม่พิมพ์
		transactionID := generateTransactionID()
		saveTransactionID(chargerID, transactionID)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo":     map[string]interface{}{"status": "Accepted"},
				"transactionId": transactionID,
			},
		}
		_ = conn.WriteJSON(response)

	case "StopTransaction":
		// ✅ ต้องการ: StopTransaction + cleared
		loglnK(LogStopTx, "🛑 StopTransaction received — ending session for", chargerID)

		clearTransactionID(chargerID)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{"status": "Accepted"},
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			// ❌ ไม่พิมพ์ error
		} else {
			loglnK(LogStopTx, "🧹 Transaction cleared for", chargerID)
		}

	case "MeterValues":
		// ✅ ต้องการ: “📊 MeterValues from ... payload = ...”
		loglnK(LogMeter, "📊 MeterValues from", chargerID, "payload =", payload)

		energyWh := extractEnergyActiveImportRegister(payload)

		if energyWh > 0 {
			dbConn := config.DB()

			// set StartEnergy ครั้งแรก
			_ = updateStartEnergyByChargePoint(dbConn, chargerID, energyWh)

			// ✅ คิด percent / auto stop (แต่ “ไม่ print debug ยาวๆ”)
			_ = broadcastPaymentPowerByChargePointOnMeterValues(dbConn, chargerID, payload, energyWh)
		}

		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			// ❌ ไม่พิมพ์ error
		} else {
			// ✅ ต้องการ: “📊 MeterValues Acknowledged”
			loglnK(LogMeter, "📊 MeterValues Acknowledged")
		}

	default:
		// ไม่พิมพ์
		response := []interface{}{3, messageID, map[string]interface{}{}}
		_ = conn.WriteJSON(response)
	}
}

func handleCallResultFromCharger(chargerID string, frame []interface{}, messageID string) {
	// ไม่อยู่ใน log ที่ขอ -> ไม่พิมพ์
	pendingMu.Lock()
	_, ok := pendingCalls[messageID]
	if ok {
		delete(pendingCalls, messageID)
	}
	pendingMu.Unlock()
}

func handleCallErrorFromCharger(chargerID string, frame []interface{}, messageID string) {
	// ไม่อยู่ใน log ที่ขอ -> ไม่พิมพ์
	pendingMu.Lock()
	_, ok := pendingCalls[messageID]
	if ok {
		delete(pendingCalls, messageID)
	}
	pendingMu.Unlock()
}

// ============================================================================
// 🚀 ส่ง RemoteStartTransaction (CSMS → Charger)
// ============================================================================
func SendRemoteStartTransaction(chargerID string, connectorID int, idTag string) error {
	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	if !ok {
		return fmt.Errorf("charger %s not connected", chargerID)
	}

	if connectorID <= 0 {
		connectorID = 1
	}
	if idTag == "" {
		idTag = "EV-SIM-001"
	}

	messageID := fmt.Sprintf("remote-start-%s-%d", chargerID, time.Now().UnixNano())

	frame := []interface{}{
		2,
		messageID,
		"RemoteStartTransaction",
		map[string]interface{}{
			"connectorId":     connectorID,
			"idTag":           idTag,
			"chargingProfile": nil,
		},
	}

	pendingMu.Lock()
	pendingCalls[messageID] = PendingCall{
		ChargerID: chargerID,
		Action:    "RemoteStartTransaction",
		SentAt:    time.Now().UTC(),
	}
	pendingMu.Unlock()

	if err := conn.WriteJSON(frame); err != nil {
		return err
	}

	// ไม่พิมพ์ (ไม่อยู่ใน log ที่ขอ)
	return nil
}

// ============================================================================
// ⛔ ส่ง RemoteStopTransaction (CSMS → Charger)
// ============================================================================
func SendRemoteStopTransaction(chargerID string, txID int) error {
	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	if !ok {
		return fmt.Errorf("charger %s not connected", chargerID)
	}

	if txID <= 0 {
		return fmt.Errorf("invalid transactionId")
	}

	messageID := fmt.Sprintf("remote-stop-%s-%d", chargerID, time.Now().UnixNano())

	frame := []interface{}{
		2,
		messageID,
		"RemoteStopTransaction",
		map[string]interface{}{
			"transactionId": txID,
		},
	}

	pendingMu.Lock()
	pendingCalls[messageID] = PendingCall{
		ChargerID: chargerID,
		Action:    "RemoteStopTransaction",
		SentAt:    time.Now().UTC(),
	}
	pendingMu.Unlock()

	if err := conn.WriteJSON(frame); err != nil {
		return err
	}

	// ไม่พิมพ์ (ไม่อยู่ใน log ที่ขอ)
	return nil
}

// ============================================================================
// ▶ API: RemoteStart (POST /ocpp/remote-start)
// ============================================================================
type RemoteStartRequest struct {
	ChargerID   string `json:"chargerId"`
	ConnectorID int    `json:"connectorId"`
	IdTag       string `json:"idTag"`
}

func RemoteStartHandler(c *gin.Context) {
	var req RemoteStartRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "invalid body",
			"detail": err.Error(),
		})
		return
	}

	if req.ChargerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chargerId is required"})
		return
	}
	if req.ConnectorID <= 0 {
		req.ConnectorID = 1
	}
	if req.IdTag == "" {
		req.IdTag = "EV-SIM-001"
	}

	chargersMu.Lock()
	_, connected := chargers[req.ChargerID]
	chargersMu.Unlock()
	if !connected {
		c.JSON(http.StatusBadRequest, gin.H{"error": "charger not connected"})
		return
	}

	statusMu.Lock()
	st, ok := chargerStatuses[req.ChargerID]
	statusMu.Unlock()
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no status for this charger"})
		return
	}
	if st.Status != "Preparing" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "charger must be in Preparing state to start",
			"status": st.Status,
		})
		return
	}

	if err := SendRemoteStartTransaction(req.ChargerID, req.ConnectorID, req.IdTag); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "RemoteStartTransaction sent"})
}

// ============================================================================
// ▶ API: RemoteStop (POST /ocpp/remote-stop)
// ============================================================================
type RemoteStopRequest struct {
	ChargerID string `json:"chargerId"`
}

func RemoteStopHandler(c *gin.Context) {
	var req RemoteStopRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	txID, ok := getTransactionID(req.ChargerID)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no active transaction"})
		return
	}

	if err := SendRemoteStopTransaction(req.ChargerID, txID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "RemoteStopTransaction sent"})
}

// ============================================================================
// ▶ API: Get Current Status (GET /ocpp/status/:chargerID)
// ============================================================================
func GetChargerStatusHandler(c *gin.Context) {
	chargerID := c.Param("chargerID")

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	statusMu.Unlock()

	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no status for this charger"})
		return
	}

	chargersMu.Lock()
	_, connected := chargers[chargerID]
	chargersMu.Unlock()
	st.Connected = connected

	c.JSON(http.StatusOK, gin.H{"data": st})
}

// ============================================================================
// 🧩 Helper: ดึงค่า Energy.Active.Import.Register (Wh) จาก MeterValues payload
// ============================================================================
func extractEnergyActiveImportRegister(payload map[string]interface{}) float64 {
	meterValuesRaw, ok := payload["meterValue"].([]interface{})
	if !ok || len(meterValuesRaw) == 0 {
		return 0
	}

	mv0, ok := meterValuesRaw[0].(map[string]interface{})
	if !ok {
		return 0
	}

	sampledValuesRaw, ok := mv0["sampledValue"].([]interface{})
	if !ok || len(sampledValuesRaw) == 0 {
		return 0
	}

	for _, sv := range sampledValuesRaw {
		m, ok := sv.(map[string]interface{})
		if !ok {
			continue
		}

		measurand, _ := m["measurand"].(string)
		if measurand != "Energy.Active.Import.Register" {
			continue
		}

		if valStr, ok := m["value"].(string); ok && valStr != "" {
			f, err := strconv.ParseFloat(valStr, 64)
			if err != nil {
				return 0
			}
			return f
		}
		if valNum, ok := m["value"].(float64); ok {
			return valNum
		}
	}
	return 0
}

// ============================================================================
// 🧩 Logic: Update StartEnergy โดยใช้ ChargePoint (chargerID)
// ============================================================================
func updateStartEnergyByChargePoint(db *gorm.DB, chargePoint string, startEnergy float64) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return fmt.Errorf("chargePoint is required")
	}
	if startEnergy <= 0 {
		return nil
	}

	var sessions []entity.ChargingSession
	if err := db.
		Where("status = ? AND start_energy = 0", true).
		Find(&sessions).Error; err != nil {
		return fmt.Errorf("query active charging sessions failed: %w", err)
	}

	if len(sessions) == 0 {
		return nil
	}

	for _, s := range sessions {
		if s.PaymentID == 0 {
			continue
		}

		if err := db.Preload("Payment").First(&s, s.ID).Error; err != nil {
			continue
		}
		if s.Payment.EVCabinetID == nil {
			continue
		}

		var cab entity.EVCabinet
		if err := db.First(&cab, *s.Payment.EVCabinetID).Error; err != nil {
			continue
		}
		if cab.ChargePoint != chargePoint {
			continue
		}

		s.StartEnergy = startEnergy
		if s.StartTime.IsZero() {
			s.StartTime = time.Now()
		}

		if err := db.Save(&s).Error; err != nil {
			return fmt.Errorf("update StartEnergy/StartTime failed for sessionID=%d: %w", s.ID, err)
		}

		// ✅ data event (ห้ามโดนปิด)
		startEnergyMsg := map[string]interface{}{
			"type":         "start_energy_updated",
			"chargePoint":  chargePoint,
			"session_id":   s.ID,
			"start_energy": s.StartEnergy,
			"start_time":   s.StartTime.Format(time.RFC3339),
		}

		if b, err := json.Marshal(startEnergyMsg); err == nil {
			broadcastToFrontendRoom(chargePoint, b)
		}

		return nil
	}

	return nil
}

// ============================================================================
// 🧩 SuspendedEV -> Update EndTime
// ============================================================================
func updateEndTimeOnSuspendedEVByChargePoint(db *gorm.DB, chargePoint string) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return fmt.Errorf("chargePoint is required")
	}

	var cab entity.EVCabinet
	if err := db.Where("charge_point = ?", chargePoint).First(&cab).Error; err != nil {
		return fmt.Errorf("find EVCabinet by charge_point failed: %w", err)
	}

	var pay entity.Payment
	if err := db.
		Where("ev_cabinet_id = ?", cab.ID).
		Order("created_at DESC").
		First(&pay).Error; err != nil {
		return fmt.Errorf("find latest Payment by EVCabinetID failed: %w", err)
	}

	var session entity.ChargingSession
	if err := db.
		Where("payment_id = ? AND status = ?", pay.ID, true).
		Order("created_at DESC").
		First(&session).Error; err != nil {
		return fmt.Errorf("find active ChargingSession by PaymentID failed: %w", err)
	}

	session.EndTime = time.Now()
	if err := db.Save(&session).Error; err != nil {
		return fmt.Errorf("update EndTime for ChargingSessionID=%d failed: %w", session.ID, err)
	}
	return nil
}

// ============================================================================
// ✅ Finishing/Faulted -> Update EndTime + session.status=false
// ============================================================================
func updateEndTimeAndCloseOnFinishingByChargePoint(db *gorm.DB, chargePoint string) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return fmt.Errorf("chargePoint is required")
	}

	var cab entity.EVCabinet
	if err := db.Where("charge_point = ?", chargePoint).First(&cab).Error; err != nil {
		return fmt.Errorf("find EVCabinet by charge_point failed: %w", err)
	}

	var pay entity.Payment
	if err := db.
		Where("ev_cabinet_id = ?", cab.ID).
		Order("created_at DESC").
		First(&pay).Error; err != nil {
		return fmt.Errorf("find latest Payment by EVCabinetID failed: %w", err)
	}

	var session entity.ChargingSession
	if err := db.
		Where("payment_id = ? AND status = ?", pay.ID, true).
		Order("created_at DESC").
		First(&session).Error; err != nil {
		return fmt.Errorf("find active ChargingSession by PaymentID failed: %w", err)
	}

	session.EndTime = time.Now()
	session.Status = false

	if err := db.Save(&session).Error; err != nil {
		return fmt.Errorf("close session on Finishing failed for ChargingSessionID=%d: %w", session.ID, err)
	}

	return nil
}

// ============================================================================
// ✅ Helper: หา active session (status=true) ที่ตรง chargePoint
// ============================================================================
func findActiveSessionByChargePoint(db *gorm.DB, chargePoint string) (entity.ChargingSession, bool, error) {
	if db == nil {
		return entity.ChargingSession{}, false, fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return entity.ChargingSession{}, false, fmt.Errorf("chargePoint is required")
	}

	var sessions []entity.ChargingSession
	if err := db.
		Where("status = ?", true).
		Order("created_at DESC").
		Limit(50).
		Find(&sessions).Error; err != nil {
		return entity.ChargingSession{}, false, err
	}

	if len(sessions) == 0 {
		return entity.ChargingSession{}, false, gorm.ErrRecordNotFound
	}

	for _, s := range sessions {
		if s.PaymentID == 0 {
			continue
		}

		if err := db.Preload("Payment").First(&s, s.ID).Error; err != nil {
			continue
		}
		if s.Payment.EVCabinetID == nil {
			continue
		}

		var cab entity.EVCabinet
		if err := db.First(&cab, *s.Payment.EVCabinetID).Error; err != nil {
			continue
		}
		if cab.ChargePoint != chargePoint {
			continue
		}

		return s, true, nil
	}

	return entity.ChargingSession{}, false, gorm.ErrRecordNotFound
}

// ============================================================================
// ✅ Helper: ปิด session (EndTime + status=false)
// ============================================================================
func closeSessionByID(db *gorm.DB, sessionID uint) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if sessionID == 0 {
		return fmt.Errorf("invalid sessionID")
	}

	var sess entity.ChargingSession
	if err := db.First(&sess, sessionID).Error; err != nil {
		return err
	}

	if !sess.EndTime.IsZero() && !sess.Status {
		return nil
	}

	sess.EndTime = time.Now()
	sess.Status = false

	if err := db.Save(&sess).Error; err != nil {
		return err
	}
	return nil
}

// ============================================================================
// ✅ MeterValues -> รวม power -> คิด % -> auto stop
// ❗ “ไม่พิมพ์ debug ยาวๆ” แล้ว (ตามที่คุณไม่ต้องการ)
// ============================================================================
func broadcastPaymentPowerByChargePointOnMeterValues(db *gorm.DB, chargePoint string, meterPayload map[string]interface{}, energyWh float64) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return fmt.Errorf("chargePoint is required")
	}

	sess, ok, err := findActiveSessionByChargePoint(db, chargePoint)
	if err != nil || !ok {
		if err == gorm.ErrRecordNotFound {
			return nil
		}
		return err
	}
	if sess.PaymentID == 0 {
		return nil
	}

	var cab entity.EVCabinet
	if err := db.Where("charge_point = ?", chargePoint).First(&cab).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil
		}
		return err
	}

	var pay entity.Payment
	if err := db.Preload("EVChargingPayments").First(&pay, sess.PaymentID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil
		}
		return err
	}
	if pay.EVCabinetID == nil {
		return nil
	}
	if *pay.EVCabinetID != cab.ID {
		return nil
	}

	type PowerItem struct {
		EVchargingID   uint    `json:"evcharging_id"`
		Name           string  `json:"name"`
		PowerKwh       float64 `json:"power_kwh"`
		PowerKwhString string  `json:"power_kwh_str"`
		Price          float64 `json:"price"`
		Percent        float64 `json:"percent"`
		RemainingPower float64 `json:"remaining_power"`
	}

	items := make([]PowerItem, 0, len(pay.EVChargingPayments))
	var totalPowerKwh float64

	for _, it := range pay.EVChargingPayments {
		name := getEVchargingNameByID(db, it.EVchargingID)
		if name == "" {
			name = fmt.Sprintf("EVcharging-%d", it.EVchargingID)
		}

		powerStr := fmt.Sprintf("%.2f", it.Power)
		remStr := fmt.Sprintf("%.2f", it.RemainingPower)
		priceStr := fmt.Sprintf("%.2f", it.Price)
		percentStr := fmt.Sprintf("%.2f", it.Percent)

		powerFloat, _ := strconv.ParseFloat(powerStr, 64)
		remFloat, _ := strconv.ParseFloat(remStr, 64)
		priceFloat, _ := strconv.ParseFloat(priceStr, 64)
		percentFloat, _ := strconv.ParseFloat(percentStr, 64)

		totalPowerKwh += powerFloat

		items = append(items, PowerItem{
			EVchargingID:   it.EVchargingID,
			Name:           name,
			PowerKwh:       powerFloat,
			PowerKwhString: powerStr,
			Price:          priceFloat,
			Percent:        percentFloat,
			RemainingPower: remFloat,
		})
	}

	startEnergyWh := sess.StartEnergy
	totalPowerWh := totalPowerKwh * 1000.0
	endEnergyWh := startEnergyWh + totalPowerWh

	usedWh := energyWh - startEnergyWh
	if usedWh < 0 {
		usedWh = 0
	}

	var usedPercent float64
	var remainingWh float64
	var remainingPercent float64
	var rawUsedPercent float64

	if totalPowerWh > 0 && startEnergyWh > 0 {
		rawUsedPercent = (usedWh / totalPowerWh) * 100.0

		usedPercent = rawUsedPercent
		if usedPercent < 0 {
			usedPercent = 0
		}
		if usedPercent > 100 {
			usedPercent = 100
		}

		remainingWh = totalPowerWh - usedWh
		if remainingWh < 0 {
			remainingWh = 0
		}

		remainingPercent = 100.0 - usedPercent
		if remainingPercent < 0 {
			remainingPercent = 0
		}
		if remainingPercent > 100 {
			remainingPercent = 100
		}

		usedPercent = math.Round(usedPercent*100) / 100
		remainingPercent = math.Round(remainingPercent*100) / 100
		usedWh = math.Round(usedWh*100) / 100
		totalPowerWh = math.Round(totalPowerWh*100) / 100
		endEnergyWh = math.Round(endEnergyWh*100) / 100
		startEnergyWh = math.Round(startEnergyWh*100) / 100
		remainingWh = math.Round(remainingWh*100) / 100
		totalPowerKwh = math.Round(totalPowerKwh*100) / 100
	}

	// auto stop (logic เดิม) แต่ไม่พิมพ์ debug
	if totalPowerWh > 0 && startEnergyWh > 0 && rawUsedPercent >= 100.0 {
		if markAutoStopped(sess.ID) {
			txID, hasTx := getTransactionID(chargePoint)
			if !hasTx || txID <= 0 {
				txID = extractTransactionIDFromMeterValues(meterPayload)
			}
			if txID > 0 {
				_ = SendRemoteStopTransaction(chargePoint, txID)
			}
			_ = closeSessionByID(db, sess.ID)
		}
	}

	// ✅ ส่ง DATA JSON (ห้ามโดนปิด)
	msg := map[string]interface{}{
		"type":        "meter_values_payment_info",
		"chargePoint": chargePoint,

		"meter_values": map[string]interface{}{
			"energy_wh":      energyWh,
			"transaction_id": extractTransactionIDFromMeterValues(meterPayload),
			"timestamp":      extractTimestampFromMeterValues(meterPayload),
		},

		"charging_session": map[string]interface{}{
			"id":           sess.ID,
			"status":       sess.Status,
			"payment_id":   sess.PaymentID,
			"start_energy": startEnergyWh,
		},

		"ev_cabinet": map[string]interface{}{
			"id":          cab.ID,
			"chargePoint": cab.ChargePoint,
			"name":        cab.Name,
		},

		"payment": map[string]interface{}{
			"id":              pay.ID,
			"amount":          pay.Amount,
			"referenceNumber": pay.ReferenceNumber,
			"ev_cabinet_id":   *pay.EVCabinetID,
		},

		"ev_charging_payments": items,

		"calculation": map[string]interface{}{
			"start_energy_wh":   startEnergyWh,
			"total_power_kwh":   totalPowerKwh,
			"total_power_wh":    totalPowerWh,
			"end_energy_wh":     endEnergyWh,
			"current_energy_wh": energyWh,
			"used_wh":           usedWh,
			"used_percent":      usedPercent,
			"remaining_wh":      remainingWh,
			"remaining_percent": remainingPercent,
		},
	}

	b, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	broadcastToFrontendRoom(chargePoint, b)

	// ✅ text log (ปิดได้) — ถ้าอยาก “ไม่ส่ง” ก็ลบได้ แต่ไม่กระทบระบบ
	broadcastLogTextToFrontendRoomK(LogMeter, chargePoint, fmt.Sprintf(
		"[PERCENT] chargePoint=%s start=%.2fWh total=%.2fWh end=%.2fWh now=%.2fWh used=%.2fWh (%.2f%%) remaining=%.2fWh (%.2f%%)\n",
		chargePoint, startEnergyWh, totalPowerWh, endEnergyWh, energyWh, usedWh, usedPercent, remainingWh, remainingPercent,
	))

	return nil
}

// ============================================================================
// ✅ Helper: ดึงชื่อ EVcharging (เช่น Solar / Grid)
// ============================================================================
func getEVchargingNameByID(db *gorm.DB, evchargingID uint) string {
	if db == nil || evchargingID == 0 {
		return ""
	}
	type row struct {
		Name string `gorm:"column:name"`
	}
	var r row

	if err := db.Model(&entity.EVcharging{}).
		Select("name").
		Where("id = ?", evchargingID).
		Scan(&r).Error; err != nil {
		return ""
	}
	return r.Name
}

func extractTransactionIDFromMeterValues(payload map[string]interface{}) int {
	if payload == nil {
		return 0
	}
	if v, ok := payload["transactionId"].(float64); ok {
		return int(v)
	}
	if v, ok := payload["transactionId"].(int); ok {
		return v
	}
	return 0
}

func extractTimestampFromMeterValues(payload map[string]interface{}) string {
	meterValuesRaw, ok := payload["meterValue"].([]interface{})
	if !ok || len(meterValuesRaw) == 0 {
		return ""
	}
	mv0, ok := meterValuesRaw[0].(map[string]interface{})
	if !ok {
		return ""
	}
	if ts, ok := mv0["timestamp"].(string); ok {
		return ts
	}
	return ""
}
