package ocpp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
)

// ============================================================================
// 🔧 WebSocket Upgrader (OCPP 1.6J ใช้ subprotocol "ocpp1.6")
// ============================================================================
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// อนุญาตทุก origin (ถ้า production ให้ tighten ตรงนี้)
		return true
	},
	Subprotocols: []string{"ocpp1.6"},
}

// ============================================================================
// 🌐 Frontend WebSocket Clients (ดู log OCPP แบบ real-time)
// ============================================================================
var (
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex
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

// ⭐ map เก็บสถานะของแต่ละตู้
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
// 🧮 Helper: สร้าง transaction id ไม่ซ้ำ
// ============================================================================
func generateTransactionID() int {
	txMu.Lock()
	defer txMu.Unlock()

	id := nextTransactionID
	nextTransactionID++
	return id
}

// บันทึก session
func saveTransactionID(chargerID string, tx int) {
	txMu.Lock()
	transactionIDs[chargerID] = tx
	txMu.Unlock()
}

// ดึง session
func getTransactionID(chargerID string) (int, bool) {
	txMu.Lock()
	defer txMu.Unlock()
	tx, ok := transactionIDs[chargerID]
	return tx, ok
}

// ลบ session หลัง StopTransaction
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
// 📡 Broadcast log / msg ไป frontend
// ============================================================================
func broadcastToFrontend(msg []byte) {
	clientsMu.Lock()
	defer clientsMu.Unlock()

	for client := range clients {
		if err := client.WriteMessage(websocket.TextMessage, msg); err != nil {
			client.Close()
			delete(clients, client)
		}
	}
}

func broadcastTextToFrontend(s string) {
	broadcastToFrontend([]byte(s))
}

// ============================================================================
// 🔹 FRONTEND WebSocket (ใช้ดู log OCPP แบบ Real-time)
// ============================================================================
func HandleFrontend(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Println("❌ Upgrade frontend error:", err)
		return
	}
	defer conn.Close()

	clientsMu.Lock()
	clients[conn] = true
	clientsMu.Unlock()

	fmt.Println("🌐 Frontend connected")
	broadcastTextToFrontend("[SYSTEM] Frontend connected\n")

	for {
		if _, _, err := conn.NextReader(); err != nil {
			clientsMu.Lock()
			delete(clients, conn)
			clientsMu.Unlock()
			fmt.Println("❌ Frontend disconnected")
			broadcastTextToFrontend("[SYSTEM] Frontend disconnected\n")
			break
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
		fmt.Println("❌ Upgrade OCPP error:", err)
		return
	}
	defer conn.Close()

	// ตรวจ subprotocol (บางตู้จะเช็ค)
	if conn.Subprotocol() != "ocpp1.6" {
		fmt.Println("⚠️ Subprotocol mismatch, expected ocpp1.6, got:", conn.Subprotocol())
	}

	chargerID := c.Param("chargerID")

	chargersMu.Lock()
	chargers[chargerID] = conn
	chargersMu.Unlock()

	fmt.Println("🚗 Charger connected:", chargerID)
	broadcastTextToFrontend("[SYSTEM] Charger connected: " + chargerID + "\n")

	// อัปเดตสถานะว่า connected
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
		fmt.Println("⚠️ Charger disconnected:", chargerID)
		broadcastTextToFrontend("[SYSTEM] Charger disconnected: " + chargerID + "\n")

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
			fmt.Println("❌ OCPP read error:", err)
			break
		}

		// ส่ง raw frame ให้ frontend ดูก่อน
		broadcastToFrontend(msg)

		// พยายาม parse JSON เป็น []interface{}
		var frame []interface{}
		if err := json.Unmarshal(msg, &frame); err != nil {
			fmt.Println("❌ JSON parse error:", err)
			continue
		}

		if len(frame) < 3 {
			fmt.Println("⚠️ Invalid OCPP frame length:", len(frame))
			continue
		}

		// messageTypeId
		messageTypeFloat, ok := frame[0].(float64)
		if !ok {
			fmt.Println("⚠️ messageType is not number")
			continue
		}
		messageType := int(messageTypeFloat)

		// uniqueId
		messageID, ok := frame[1].(string)
		if !ok {
			fmt.Println("⚠️ messageId is not string")
			continue
		}

		switch messageType {
		// --------------------------------------------------------------------
		// 2 = CALL  (จากตู้ → CSMS)
		// --------------------------------------------------------------------
		case 2:
			handleCallFromCharger(chargerID, conn, frame, messageID)

		// --------------------------------------------------------------------
		// 3 = CALLRESULT (จากตู้ตอบกลับ CALL ของเรา เช่น RemoteStart)
		// --------------------------------------------------------------------
		case 3:
			handleCallResultFromCharger(chargerID, frame, messageID)

		// --------------------------------------------------------------------
		// 4 = CALLERROR (ตู้ตอบ error กลับ CALL ของเรา)
		// --------------------------------------------------------------------
		case 4:
			handleCallErrorFromCharger(chargerID, frame, messageID)

		default:
			fmt.Println("⚠️ Unknown messageType:", messageType)
		}
	}
}

// ============================================================================
// 🧠 Handlers: CALL / CALLRESULT / CALLERROR จากตู้
// ============================================================================

// CALL from Charger → CSMS
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

	fmt.Printf("📥 CALL from %s: action=%s payload=%v\n", chargerID, action, payload)

	switch action {

	// ---------------------------------------------------------------
	// BootNotification (ตู้แจ้งตัวเข้าระบบ)
	// ---------------------------------------------------------------
	case "BootNotification":
		vendor, _ := payload["chargePointVendor"].(string)
		model, _ := payload["chargePointModel"].(string)
		fmt.Printf("🔌 BootNotification from %s | Vendor=%s Model=%s\n", chargerID, vendor, model)

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
			fmt.Println("❌ Failed to send BootNotification conf:", err)
		} else {
			fmt.Println("✅ BootNotification Accepted for", chargerID)
			broadcastTextToFrontend("[SENT] BootNotification.conf to " + chargerID + "\n")
		}

	// ---------------------------------------------------------------
	// Heartbeat
	// ---------------------------------------------------------------
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

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"currentTime": nowOcppTime(),
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			fmt.Println("❌ Failed to send Heartbeat conf:", err)
		} else {
			fmt.Println("💓 Heartbeat Answered for", chargerID)
		}

	// ---------------------------------------------------------------
	// Authorize
	// ---------------------------------------------------------------
	case "Authorize":
		idTag, _ := payload["idTag"].(string)
		fmt.Println("🔐 Authorize request from", chargerID, "idTag =", idTag)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status": "Accepted",
				},
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			fmt.Println("❌ Failed to send Authorize conf:", err)
		} else {
			fmt.Println("✅ Authorize Accepted for", chargerID)
		}

	// ---------------------------------------------------------------
	// StatusNotification
	// ---------------------------------------------------------------
	case "StatusNotification":
		fmt.Println("📥 StatusNotification from", chargerID)

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
		if err := conn.WriteJSON(response); err != nil {
			fmt.Println("❌ Failed to send StatusNotification conf:", err)
		} else {
			fmt.Printf("✅ StatusNotification stored: %+v\n", newSt)
		}

	// ---------------------------------------------------------------
	// StartTransaction
	// ---------------------------------------------------------------
	case "StartTransaction":
		fmt.Println("🚗 StartTransaction received from", chargerID)

		transactionID := generateTransactionID()
		saveTransactionID(chargerID, transactionID)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status": "Accepted",
				},
				"transactionId": transactionID,
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			fmt.Println("❌ Failed to send StartTransaction conf:", err)
		} else {
			fmt.Println("🎉 StartTransaction Accepted → transactionId =", transactionID)
		}

	// ---------------------------------------------------------------
	// StopTransaction
	// ---------------------------------------------------------------
	case "StopTransaction":
		fmt.Println("🛑 StopTransaction received — ending session for", chargerID)

		clearTransactionID(chargerID)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status": "Accepted",
				},
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			fmt.Println("❌ Failed to send StopTransaction conf:", err)
		} else {
			fmt.Println("🧹 Transaction cleared for", chargerID)
		}

	// ---------------------------------------------------------------
	// MeterValues
	// ---------------------------------------------------------------
	case "MeterValues":
		fmt.Println("📊 MeterValues from", chargerID, "payload =", payload)

		energyWh := extractEnergyActiveImportRegister(payload)
		if energyWh > 0 {
			// ดึง DB จาก config เหมือน controller อื่น
			dbConn := config.DB()
			if err := updateStartEnergyByChargePoint(dbConn, chargerID, energyWh); err != nil {
				fmt.Println("❌ updateStartEnergyByChargePoint error:", err)
			}
		}

		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			fmt.Println("❌ Failed to send MeterValues conf:", err)
		} else {
			fmt.Println("📊 MeterValues Acknowledged")
		}

	// ---------------------------------------------------------------
	// DiagnosticsStatusNotification, FirmwareStatusNotification, DataTransfer
	// ---------------------------------------------------------------
	case "DiagnosticsStatusNotification", "FirmwareStatusNotification", "DataTransfer":
		fmt.Printf("📥 %s from %s payload=%v\n", action, chargerID, payload)
		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			fmt.Printf("❌ Failed to send %s conf: %v\n", action, err)
		} else {
			fmt.Printf("✅ %s Acknowledged\n", action)
		}

	default:
		fmt.Printf("⚠️ Unhandled CALL action=%s from %s payload=%v\n", action, chargerID, payload)
		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			fmt.Println("❌ Failed to send generic CALLRESULT:", err)
		}
	}
}

// CALLRESULT from Charger → CSMS
func handleCallResultFromCharger(chargerID string, frame []interface{}, messageID string) {
	var payload map[string]interface{}
	if len(frame) >= 3 {
		if p, ok := frame[2].(map[string]interface{}); ok {
			payload = p
		}
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}

	pendingMu.Lock()
	pending, ok := pendingCalls[messageID]
	if ok {
		delete(pendingCalls, messageID)
	}
	pendingMu.Unlock()

	if ok {
		fmt.Printf("📥 CALLRESULT for %s from %s: action=%s payload=%v\n",
			messageID, chargerID, pending.Action, payload)
	} else {
		fmt.Printf("📥 CALLRESULT (unknown messageId=%s) from %s payload=%v\n",
			messageID, chargerID, payload)
	}
}

// CALLERROR from Charger → CSMS
func handleCallErrorFromCharger(chargerID string, frame []interface{}, messageID string) {
	errorCode := ""
	errorDescription := ""
	var details map[string]interface{}

	if len(frame) >= 3 {
		if s, ok := frame[2].(string); ok {
			errorCode = s
		}
	}
	if len(frame) >= 4 {
		if s, ok := frame[3].(string); ok {
			errorDescription = s
		}
	}
	if len(frame) >= 5 {
		if d, ok := frame[4].(map[string]interface{}); ok {
			details = d
		}
	}
	if details == nil {
		details = map[string]interface{}{}
	}

	pendingMu.Lock()
	pending, ok := pendingCalls[messageID]
	if ok {
		delete(pendingCalls, messageID)
	}
	pendingMu.Unlock()

	if ok {
		fmt.Printf("❌ CALLERROR for %s from %s: action=%s code=%s desc=%s details=%v\n",
			messageID, chargerID, pending.Action, errorCode, errorDescription, details)
	} else {
			fmt.Printf("❌ CALLERROR (unknown messageId=%s) from %s code=%s desc=%s details=%v\n",
			messageID, chargerID, errorCode, errorDescription, details)
	}
}

// ============================================================================
// 🚀 ส่ง RemoteStartTransaction (CSMS → Charger)
// ============================================================================
func SendRemoteStartTransaction(chargerID string, connectorID int, idTag string) error {
	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	if !ok {
		err := fmt.Errorf("charger %s not connected", chargerID)
		fmt.Println("❌", err)
		return err
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
		fmt.Println("❌ Failed to send RemoteStartTransaction:", err)
		return err
	}

	fmt.Println("➡️ RemoteStartTransaction sent to", chargerID, "connectorId =", connectorID, "idTag =", idTag)
	broadcastTextToFrontend("[SENT] RemoteStartTransaction to " + chargerID + "\n")
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
		err := fmt.Errorf("charger %s not connected", chargerID)
		fmt.Println("❌", err)
		return err
	}

	if txID <= 0 {
		return fmt.Errorf("❌ invalid transactionId")
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
		fmt.Println("❌ Failed to send RemoteStopTransaction:", err)
		return err
	}

	fmt.Println("➡️ RemoteStopTransaction sent to", chargerID, "txID =", txID)
	broadcastTextToFrontend("[SENT] RemoteStopTransaction to " + chargerID + "\n")
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
		fmt.Println("❌ RemoteStart invalid body:", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "invalid body",
			"detail": err.Error(),
		})
		return
	}

	fmt.Printf("🟦 RemoteStartHandler request: %+v\n", req)

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
		fmt.Println("❌ RemoteStart: charger not connected:", req.ChargerID)
		c.JSON(http.StatusBadRequest, gin.H{"error": "charger not connected"})
		return
	}

	statusMu.Lock()
	st, ok := chargerStatuses[req.ChargerID]
	statusMu.Unlock()
	if !ok {
		fmt.Println("❌ RemoteStart: no status for charger:", req.ChargerID)
		c.JSON(http.StatusBadRequest, gin.H{"error": "no status for this charger"})
		return
	}
	if st.Status != "Preparing" {
		fmt.Printf("❌ RemoteStart: charger %s status is %s (need Preparing)\n", req.ChargerID, st.Status)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "charger must be in Preparing state to start",
			"status": st.Status,
		})
		return
	}

	if err := SendRemoteStartTransaction(req.ChargerID, req.ConnectorID, req.IdTag); err != nil {
		fmt.Println("❌ RemoteStart error:", err)
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
		fmt.Println("❌ RemoteStop invalid body:", err)
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

	c.JSON(http.StatusOK, gin.H{
		"data": st,
	})
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
				fmt.Println("⚠️ parse Energy.Active.Import.Register (string) failed:", err)
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

	// ดึงเฉพาะ session ที่ยังไม่ตั้งค่า StartEnergy และ StartTime
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

		// ต้องมี Payment และ EVCabinetID
		if s.PaymentID == 0 {
			continue
		}

		// โหลด Payment
		if err := db.Preload("Payment").First(&s, s.ID).Error; err != nil {
			fmt.Printf("⚠️ preload Payment failed (sessionID=%d): %v\n", s.ID, err)
			continue
		}

		if s.Payment.EVCabinetID == nil {
			continue
		}

		// หา Cabinet
		var cab entity.EVCabinet
		if err := db.First(&cab, *s.Payment.EVCabinetID).Error; err != nil {
			fmt.Printf("⚠️ find EVCabinet failed (paymentID=%d): %v\n", s.PaymentID, err)
			continue
		}

		// ต้อง match chargePoint
		if cab.ChargePoint != chargePoint {
			continue
		}

		// อัปเดต StartEnergy
		s.StartEnergy = startEnergy

		// อัปเดต StartTime เฉพาะครั้งแรกเท่านั้น
		if s.StartTime.IsZero() {
			s.StartTime = time.Now()
		}

		// Save
		if err := db.Save(&s).Error; err != nil {
			return fmt.Errorf("update StartEnergy/StartTime failed for sessionID=%d: %w", s.ID, err)
		}

		fmt.Printf(
			"✅ Update StartEnergy & StartTime sessionID=%d chargePoint=%s startEnergy=%.2f StartTime=%s\n",
			s.ID, chargePoint, startEnergy, s.StartTime.Format(time.RFC3339),
		)

		return nil
	}

	return nil
}

