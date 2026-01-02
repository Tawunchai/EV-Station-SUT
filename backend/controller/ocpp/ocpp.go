/* ==== FULL FILE: package ocpp (ocpp.go) ==== */
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
// ✅ NEW: VERBOSE LOG (เปิดเฉพาะตอน debug) — default ปิด
// - สำคัญ: โหมดปกติจะ print log เฉพาะ “จำเป็น” (ตามที่คุณต้องการ)
// ============================================================================

var logVerbose uint32 = 0 // 1 = verbose on, 0 = verbose off

func isLogVerbose() bool { return atomic.LoadUint32(&logVerbose) == 1 }

func setLogVerbose(v bool) {
	if v {
		atomic.StoreUint32(&logVerbose, 1)
	} else {
		atomic.StoreUint32(&logVerbose, 0)
	}
}

// ใช้แทน fmt.Println/Printf ทั้งหมด เพื่อ toggle ได้
// ✅ logln/logf = “จำเป็น/หลัก” (print เฉพาะที่ต้องการให้เห็นบน server)
func logln(args ...interface{}) {
	if !isLogEnabled() {
		return
	}
	fmt.Println(args...)
}

func logf(format string, args ...interface{}) {
	if !isLogEnabled() {
		return
	}
	fmt.Printf(format, args...)
}

// ✅ vlogln/vlogf = “verbose” (จะไม่ print ถ้าไม่ได้เปิด verbose)
func vlogln(args ...interface{}) {
	if !isLogEnabled() || !isLogVerbose() {
		return
	}
	fmt.Println(args...)
}

func vlogf(format string, args ...interface{}) {
	if !isLogEnabled() || !isLogVerbose() {
		return
	}
	fmt.Printf(format, args...)
}

// ใช้แทน broadcastTextToFrontendRoom สำหรับ “ข้อความ log”
func broadcastLogTextToFrontendRoom(roomID, s string) {
	if !isLogEnabled() {
		return
	}
	broadcastToFrontendRoom(roomID, []byte(s))
}

// ============================================================================
// 🔧 WebSocket Upgrader (แยก Frontend vs OCPP Charger)
// ============================================================================

// ✅ สำหรับ OCPP Charger เท่านั้น (ต้องมี subprotocol ocpp1.6)
var ocppUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	Subprotocols: []string{"ocpp1.6"},
}

// ✅ สำหรับ Frontend ดู log (Browser จะไม่ส่ง subprotocol ocpp1.6)
var frontendUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
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
// ✅ NEW: เก็บ “สถานะจริงล่าสุดก่อนหลุด” เพื่อ restore ตอน reconnect
// ============================================================================

var (
	lastRealStatuses = make(map[string]ChargerStatus) // chargerID -> last real status
	lastRealMu       sync.Mutex
)

func saveLastRealStatus(chargerID string, st ChargerStatus) {
	if chargerID == "" {
		return
	}
	if st.Status == "Interruption" {
		return
	}
	lastRealMu.Lock()
	lastRealStatuses[chargerID] = st
	lastRealMu.Unlock()
}

func getLastRealStatus(chargerID string) (ChargerStatus, bool) {
	lastRealMu.Lock()
	defer lastRealMu.Unlock()
	st, ok := lastRealStatuses[chargerID]
	return st, ok
}

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
// ✅ NEW: HOLD DISCONNECT 10 นาที
// ============================================================================

const disconnectHoldDuration = 10 * time.Minute

var (
	disconnectHoldTimers   = make(map[string]*time.Timer) // chargerID -> timer
	disconnectHoldTimersMu sync.Mutex
)

func cancelDisconnectHold(chargerID string) {
	disconnectHoldTimersMu.Lock()
	t, ok := disconnectHoldTimers[chargerID]
	if ok && t != nil {
		stopped := t.Stop()
		if !stopped {
			select {
			case <-t.C:
			default:
			}
		}
		delete(disconnectHoldTimers, chargerID)
	}
	disconnectHoldTimersMu.Unlock()
}

func scheduleDisconnectHold(chargerID string) {
	if chargerID == "" {
		return
	}

	cancelDisconnectHold(chargerID)

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}
	saveLastRealStatus(chargerID, st)

	st.Connected = false
	st.Status = "Interruption"
	st.ErrorCode = "Interruption"
	st.LastHeartbeat = time.Now().UTC()
	chargerStatuses[chargerID] = st
	statusMu.Unlock()

	dataMsg := map[string]interface{}{
		"type":      "charger_connection_hold",
		"chargerId": chargerID,
		"connected": false,
		"hold_sec":  int(disconnectHoldDuration.Seconds()),
		"status":    "Interruption",
		"errorCode": "Interruption",
		"timestamp": nowOcppTime(),
	}

	statusMsg := map[string]interface{}{
		"type":      "charger_status_update",
		"chargerId": chargerID,
		"status":    "Interruption",
		"errorCode": "Interruption",
		"connected": false,
		"timestamp": nowOcppTime(),
	}
	if b2, err := json.Marshal(statusMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b2)
	}
	if b, err := json.Marshal(dataMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b)
	}

	t := time.NewTimer(disconnectHoldDuration)

	disconnectHoldTimersMu.Lock()
	disconnectHoldTimers[chargerID] = t
	disconnectHoldTimersMu.Unlock()

	go func(id string, timer *time.Timer) {
		<-timer.C

		disconnectHoldTimersMu.Lock()
		if cur, ok := disconnectHoldTimers[id]; ok && cur == timer {
			delete(disconnectHoldTimers, id)
		}
		disconnectHoldTimersMu.Unlock()

		chargersMu.Lock()
		_, connected := chargers[id]
		chargersMu.Unlock()
		if connected {
			return
		}

		handleDisconnectAsInterruption(id)
	}(chargerID, t)

	// ✅ อันนี้เป็น log สำคัญ (ไม่ถี่มาก) คงไว้ได้
	logf("[HOLD] charger=%s disconnected -> send status=Interruption + hold %d minutes; if reconnect within hold, session will NOT be closed and status will be restored\n",
		chargerID, int(disconnectHoldDuration.Minutes()),
	)
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

var _ = broadcastTextToFrontendRoom

func broadcastTextToFrontendRoom(roomID, s string) {
	broadcastToFrontendRoom(roomID, []byte(s))
}

// ============================================================================
// 🔹 FRONTEND WebSocket (ดู log OCPP real-time) + ✅ command open/close/verbose
// ============================================================================

func HandleFrontend(c *gin.Context) {
	conn, err := frontendUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logln("❌ Upgrade frontend error:", err)
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

	logln("🌐 Frontend connected, room =", roomID)

	if isLogEnabled() {
		_ = conn.WriteMessage(websocket.TextMessage,
			[]byte("[SYSTEM] Frontend connected to room "+roomID+"\n"))
	}

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			frontendClientsMu.Lock()
			delete(frontendClients, conn)
			frontendClientsMu.Unlock()
			logln("❌ Frontend disconnected from room:", roomID)
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
			continue
		case "verbose_on":
			setLogVerbose(true)
			_ = conn.WriteMessage(websocket.TextMessage, []byte("[LOG] verbose_on\n"))
			continue
		case "verbose_off":
			setLogVerbose(false)
			_ = conn.WriteMessage(websocket.TextMessage, []byte("[LOG] verbose_off\n"))
			continue
		default:
		}
	}
}

// ============================================================================
// 🔹 CHARGER OCPP WebSocket (ตัวหลักคุยกับตู้จริง OCPP 1.6J)
// ============================================================================

func handleDisconnectAsInterruption(chargerID string) {
	chargersMu.Lock()
	_, connected := chargers[chargerID]
	chargersMu.Unlock()
	if connected {
		return
	}

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}
	st.Status = "Interruption"
	st.ErrorCode = "Interruption"
	st.Connected = false
	st.LastHeartbeat = time.Now().UTC()
	chargerStatuses[chargerID] = st
	statusMu.Unlock()

	dataMsg := map[string]interface{}{
		"type":      "charger_status_update",
		"chargerId": chargerID,
		"status":    "Interruption",
		"errorCode": "Interruption",
		"connected": false,
		"timestamp": nowOcppTime(),
	}
	if b, err := json.Marshal(dataMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b)
	}

	dbConn := config.DB()
	if err := updateEndTimeAndCloseOnFinishingByChargePoint(dbConn, chargerID); err != nil {
		logln("❌ disconnect->Interruption updateEndTimeAndCloseOnFinishingByChargePoint error:", err)
	} else {
		logln("✅ disconnect->Interruption -> session closed for", chargerID)
		broadcastLogTextToFrontendRoom(
			chargerID,
			"[SESSION-CLOSED] status=Interruption -> EndTime updated & status=false\n",
		)
	}

	clearTransactionID(chargerID)
}

// HandleOCPP: ws://host/ocpp/:chargerID
func HandleOCPP(c *gin.Context) {
	conn, err := ocppUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logln("❌ Upgrade OCPP error:", err)
		return
	}
	defer conn.Close()

	chargerID := c.Param("chargerID")
	if chargerID == "" {
		logln("❌ missing chargerID in URL")
		return
	}

	if conn.Subprotocol() != "ocpp1.6" {
		logln("⚠️ Subprotocol mismatch, expected ocpp1.6, got:", conn.Subprotocol(), "chargerID:", chargerID)
	}

	cancelDisconnectHold(chargerID)

	chargersMu.Lock()
	chargers[chargerID] = conn
	chargersMu.Unlock()

	logln("🚗 Charger connected:", chargerID, "subprotocol =", conn.Subprotocol())
	broadcastLogTextToFrontendRoom(chargerID, "[SYSTEM] Charger connected: "+chargerID+"\n")

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}

	if last, hasLast := getLastRealStatus(chargerID); hasLast {
		st.ConnectorID = last.ConnectorID
		st.Status = last.Status
		st.ErrorCode = last.ErrorCode
	}

	st.Connected = true
	st.LastHeartbeat = time.Now().UTC()
	chargerStatuses[chargerID] = st
	statusMu.Unlock()

	connectedMsg := map[string]interface{}{
		"type":      "charger_connection_update",
		"chargerId": chargerID,
		"connected": true,
		"status":    st.Status,
		"errorCode": st.ErrorCode,
		"timestamp": nowOcppTime(),
	}
	if b, err := json.Marshal(connectedMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b)
	}

	statusMsg := map[string]interface{}{
		"type":      "charger_status_update",
		"chargerId": chargerID,
		"status":    st.Status,
		"errorCode": st.ErrorCode,
		"connected": true,
		"timestamp": nowOcppTime(),
	}
	if b, err := json.Marshal(statusMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b)
	}

	defer func() {
		chargersMu.Lock()
		delete(chargers, chargerID)
		chargersMu.Unlock()

		logln("⚠️ Charger disconnected:", chargerID)
		broadcastLogTextToFrontendRoom(chargerID, "[SYSTEM] Charger disconnected: "+chargerID+"\n")

		scheduleDisconnectHold(chargerID)
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			logln("❌ OCPP read error:", err)
			break
		}

		if isLogEnabled() {
			broadcastToFrontendRoom(chargerID, msg)
		}

		var frame []interface{}
		if err := json.Unmarshal(msg, &frame); err != nil {
			logln("❌ JSON parse error:", err)
			continue
		}

		if len(frame) < 3 {
			logln("⚠️ Invalid OCPP frame length:", len(frame))
			continue
		}

		messageTypeFloat, ok := frame[0].(float64)
		if !ok {
			logln("⚠️ messageType is not number")
			continue
		}
		messageType := int(messageTypeFloat)

		messageID, ok := frame[1].(string)
		if !ok {
			logln("⚠️ messageId is not string")
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
			logln("⚠️ Unknown messageType:", messageType)
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

	// ✅ ลด log: print เฉพาะ MeterValues (ตามที่ต้องการ)
	if action == "MeterValues" {
		logf("📥 CALL from %s: action=%s payload=%v\n", chargerID, action, payload)
	} else {
		// ไม่ต้อง print บน server (แต่ถ้าต้อง debug เปิด verbose_on ได้)
		vlogf("📥 CALL from %s: action=%s payload=%v\n", chargerID, action, payload)
	}

	switch action {
	case "BootNotification":
		vendor, _ := payload["chargePointVendor"].(string)
		model, _ := payload["chargePointModel"].(string)
		logf("🔌 BootNotification from %s | Vendor=%s Model=%s\n", chargerID, vendor, model)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"status":      "Accepted",
				"currentTime": nowOcppTime(),
				"interval":    int(30),
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send BootNotification conf:", err)
		} else {
			logln("✅ BootNotification Accepted for", chargerID)
			broadcastLogTextToFrontendRoom(chargerID, "[SENT] BootNotification.conf to "+chargerID+"\n")
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
			logln("❌ Failed to send Heartbeat conf:", err)
		} else {
			// ✅ ลด log (Heartbeat ถี่) -> verbose เท่านั้น
			logf("💓 Heartbeat Answered for %s\n", chargerID)
		}

	case "Authorize":
		idTag, _ := payload["idTag"].(string)
		logln("🔐 Authorize request from", chargerID, "idTag =", idTag)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status":     "Accepted",
					"expiryDate": nowOcppTime(),
				},
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send Authorize conf:", err)
		} else {
			logln("✅ Authorize Accepted for", chargerID)
		}

	case "StatusNotification":
		// logf("📥 StatusNotification from %s\n", chargerID)

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

		saveLastRealStatus(chargerID, newSt)

		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send StatusNotification conf:", err)
		} else {
			// ✅ ลด log -> verbose เท่านั้น
			logf("✅ StatusNotification stored: %+v\n", newSt)
		}

		if statusStr == "SuspendedEV" {
			dbConn := config.DB()
			if err := updateEndTimeOnSuspendedEVByChargePoint(dbConn, chargerID); err != nil {
				logln("❌ updateEndTimeOnSuspendedEVByChargePoint error:", err)
			}
		}

		if statusStr == "Finishing" || statusStr == "Faulted" {
			dbConn := config.DB()
			if err := updateEndTimeAndCloseOnFinishingByChargePoint(dbConn, chargerID); err != nil {
				logln("❌ updateEndTimeAndCloseOnFinishingByChargePoint error:", err)
			} else {
				logln("✅", statusStr, "-> session closed for", chargerID)
				broadcastLogTextToFrontendRoom(
					chargerID,
					fmt.Sprintf("[SESSION-CLOSED] status=%s -> EndTime updated & status=false\n", statusStr),
				)
			}
		}

	case "StartTransaction":
		logln("🚗 StartTransaction received from", chargerID)

		transactionID := generateTransactionID()
		saveTransactionID(chargerID, transactionID)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status":     "Accepted",
					"expiryDate": nowOcppTime(),
				},
				"transactionId": transactionID,
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send StartTransaction conf:", err)
		} else {
			logln("🎉 StartTransaction Accepted → transactionId =", transactionID)
		}

	case "StopTransaction":
		logln("🛑 StopTransaction received — ending session for", chargerID)

		clearTransactionID(chargerID)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status":     "Accepted",
					"expiryDate": nowOcppTime(),
				},
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send StopTransaction conf:", err)
		} else {
			logln("🧹 Transaction cleared for", chargerID)
		}

	case "MeterValues":
		// ✅ ตามที่ต้องการ: ไม่ print payload ซ้ำ, ไม่ print acknowledged, ไม่ print “START/FOUND”
		energyWh := extractEnergyActiveImportRegister(payload)

		logf("🟨 [METERVALUES] chargePoint=%s energyWh=%.2f tx=%d ts=%s\n",
			chargerID,
			energyWh,
			extractTransactionIDFromMeterValues(payload),
			extractTimestampFromMeterValues(payload),
		)

		if energyWh > 0 {
			dbConn := config.DB()

			if err := updateStartEnergyByChargePoint(dbConn, chargerID, energyWh); err != nil {
				logln("❌ updateStartEnergyByChargePoint error:", err)
			}

			if err := broadcastPaymentPowerByChargePointOnMeterValues(dbConn, chargerID, payload, energyWh); err != nil {
				logln("❌ broadcastPaymentPowerByChargePointOnMeterValues error:", err)
			}
		} else {
			// ลด log -> verbose เท่านั้น
			vlogf("⚠️ [METERVALUES] energyWh=0 -> skip db/broadcast (chargePoint=%s)\n", chargerID)
		}

		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send MeterValues conf:", err)
		}
		// ✅ ไม่ print "Acknowledged" แล้ว

	case "DiagnosticsStatusNotification", "FirmwareStatusNotification", "DataTransfer":
		// ลด log -> verbose เท่านั้น
		vlogf("📥 %s from %s payload=%v\n", action, chargerID, payload)
		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			logf("❌ Failed to send %s conf: %v\n", action, err)
		} else {
			vlogf("✅ %s Acknowledged\n", action)
		}

	default:
		// ลด log -> verbose เท่านั้น
		vlogf("⚠️ Unhandled CALL action=%s from %s payload=%v\n", action, chargerID, payload)
		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send generic CALLRESULT:", err)
		}
	}
}

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

	// ✅ ลด log CALLRESULT (เยอะ) -> verbose เท่านั้น
	if ok {
		vlogf("📥 CALLRESULT for %s from %s: action=%s payload=%v\n", messageID, chargerID, pending.Action, payload)
	} else {
		vlogf("📥 CALLRESULT (unknown messageId=%s) from %s payload=%v\n", messageID, chargerID, payload)
	}
}

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

	// ❌ error สำคัญ -> คงไว้ให้เห็นบน server
	if ok {
		logf("❌ CALLERROR for %s from %s: action=%s code=%s desc=%s details=%v\n",
			messageID, chargerID, pending.Action, errorCode, errorDescription, details)
	} else {
		logf("❌ CALLERROR (unknown messageId=%s) from %s code=%s desc=%s details=%v\n",
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
		logln("❌", err)
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
		logln("❌ Failed to send RemoteStartTransaction:", err)
		return err
	}

	logln("➡️ RemoteStartTransaction sent to", chargerID, "connectorId =", connectorID, "idTag =", idTag)
	broadcastLogTextToFrontendRoom(chargerID, "[SENT] RemoteStartTransaction to "+chargerID+"\n")
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
		logln("❌", err)
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
		logln("❌ Failed to send RemoteStopTransaction:", err)
		return err
	}

	logln("➡️ RemoteStopTransaction sent to", chargerID, "txID =", txID)
	broadcastLogTextToFrontendRoom(chargerID, "[SENT] RemoteStopTransaction to "+chargerID+"\n")
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
		logln("❌ RemoteStart invalid body:", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "invalid body",
			"detail": err.Error(),
		})
		return
	}

	logf("🟦 RemoteStartHandler request: %+v\n", req)

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
		logln("❌ RemoteStart: charger not connected:", req.ChargerID)
		c.JSON(http.StatusBadRequest, gin.H{"error": "charger not connected"})
		return
	}

	statusMu.Lock()
	st, ok := chargerStatuses[req.ChargerID]
	statusMu.Unlock()
	if !ok {
		logln("❌ RemoteStart: no status for charger:", req.ChargerID)
		c.JSON(http.StatusBadRequest, gin.H{"error": "no status for this charger"})
		return
	}

	if st.Status != "Preparing" && st.Status != "Available" {
		logf("❌ RemoteStart: charger %s status is %s (need Preparing/Available)\n", req.ChargerID, st.Status)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "charger must be in Preparing or Available state to start",
			"status": st.Status,
		})
		return
	}

	if err := SendRemoteStartTransaction(req.ChargerID, req.ConnectorID, req.IdTag); err != nil {
		logln("❌ RemoteStart error:", err)
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
		logln("❌ RemoteStop invalid body:", err)
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
				logln("⚠️ parse Energy.Active.Import.Register (string) failed:", err)
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
// ✅ IMPROVE: ลด “DB Query ซ้ำ” ตอนเช็ค ExpiresAt
// ============================================================================

const expireExtendMinInterval = 30 * time.Second

var (
	lastExpireExtendAt   = make(map[uint]time.Time) // sessionID -> last extend attempt time
	lastExpireExtendAtMu sync.Mutex
)

func allowExpireExtend(sessionID uint) bool {
	if sessionID == 0 {
		return false
	}
	now := time.Now()
	lastExpireExtendAtMu.Lock()
	defer lastExpireExtendAtMu.Unlock()

	if t, ok := lastExpireExtendAt[sessionID]; ok {
		if now.Sub(t) < expireExtendMinInterval {
			return false
		}
	}
	lastExpireExtendAt[sessionID] = now
	return true
}

func extendSessionExpiresAtIfNeeded(db *gorm.DB, sess *entity.ChargingSession, chargePointForLog string) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if sess == nil || sess.ID == 0 {
		return nil
	}
	if !sess.Status {
		return nil
	}

	now := time.Now()

	if sess.ExpiresAt.IsZero() {
		if !allowExpireExtend(sess.ID) {
			return nil
		}

		old := sess.ExpiresAt
		newExp := now.Add(2 * time.Hour)

		if err := db.Model(&entity.ChargingSession{}).
			Where("id = ? AND status = ?", sess.ID, true).
			Update("expires_at", newExp).Error; err != nil {
			return fmt.Errorf("update ExpiresAt (zero->now+2h) failed: %w", err)
		}

		sess.ExpiresAt = newExp

		// ลด log -> verbose เท่านั้น
		vlogf("⏳ [SESSION-EXPIRE] (%s) paymentID=%d sessionID=%d ExpiresAt was ZERO (%v) -> set to %s\n",
			chargePointForLog, sess.PaymentID, sess.ID, old, sess.ExpiresAt.Format(time.RFC3339))
		return nil
	}

	remain := time.Until(sess.ExpiresAt)

	if remain <= 1*time.Hour {
		if !allowExpireExtend(sess.ID) {
			return nil
		}

		old := sess.ExpiresAt
		newExp := sess.ExpiresAt.Add(2 * time.Hour)

		if err := db.Model(&entity.ChargingSession{}).
			Where("id = ? AND status = ?", sess.ID, true).
			Update("expires_at", newExp).Error; err != nil {
			return fmt.Errorf("extend ExpiresAt +2h failed: %w", err)
		}

		sess.ExpiresAt = newExp

		// ลด log -> verbose เท่านั้น
		vlogf("⏳ [SESSION-EXPIRE] (%s) paymentID=%d sessionID=%d remain=%s -> extend ExpiresAt: %s -> %s\n",
			chargePointForLog, sess.PaymentID, sess.ID, remain.Round(time.Second).String(),
			old.Format(time.RFC3339), sess.ExpiresAt.Format(time.RFC3339))
	}

	return nil
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
			vlogf("⚠️ preload Payment failed (sessionID=%d): %v\n", s.ID, err)
			continue
		}

		if s.Payment.EVCabinetID == nil {
			continue
		}

		var cab entity.EVCabinet
		if err := db.First(&cab, *s.Payment.EVCabinetID).Error; err != nil {
			vlogf("⚠️ find EVCabinet failed (paymentID=%d): %v\n", s.PaymentID, err)
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

		// ลด log -> verbose เท่านั้น (ไม่อยู่ใน 4 บรรทัดที่ต้องการ)
		vlogf("✅ Update StartEnergy & StartTime sessionID=%d chargePoint=%s startEnergy=%.2f StartTime=%s\n",
			s.ID, chargePoint, startEnergy, s.StartTime.Format(time.RFC3339))

		startEnergyMsg := map[string]interface{}{
			"type":         "start_energy_updated",
			"chargePoint":  chargePoint,
			"session_id":   s.ID,
			"start_energy": s.StartEnergy,
			"start_time":   s.StartTime.Format(time.RFC3339),
		}

		if b, err := json.Marshal(startEnergyMsg); err != nil {
			logln("❌ marshal startEnergyMsg failed:", err)
		} else {
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

	// ลด log -> verbose เท่านั้น
	vlogf("✅ Update EndTime on SuspendedEV: sessionID=%d paymentID=%d cabinetID=%d chargePoint=%s EndTime=%s\n",
		session.ID, pay.ID, cab.ID, chargePoint, session.EndTime.Format(time.RFC3339))

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

	// ลด log -> verbose เท่านั้น
	vlogf("✅ Finishing/Faulted -> session closed: sessionID=%d paymentID=%d cabinetID=%d chargePoint=%s EndTime=%s status=%v\n",
		session.ID, pay.ID, cab.ID, chargePoint, session.EndTime.Format(time.RFC3339), session.Status)

	return nil
}

// ============================================================================
// ✅ Helper: หา active session (status=true) ที่ "ตรงกับ chargePoint" จริง ๆ
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
// ✅ Helper: Update session.EndTime + status=false (ปิด session)
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
// ✅ PRINT LOG บน SERVER เฉพาะ 4 กลุ่มที่คุณต้องการ:
// 1) 📥 CALL ... MeterValues ...
// 2) 🟨 [METERVALUES] ...
// 3) 🧾 ITEM ... (แต่ละรายการ)
// 4) 🧾 CALC ...
// 5) 🧾 BROADCAST ...
// ============================================================================

func broadcastPaymentPowerByChargePointOnMeterValues(db *gorm.DB, chargePoint string, meterPayload map[string]interface{}, energyWh float64) error {
	debugPrefix := fmt.Sprintf("🧾 [METER->PAYMENT] (%s) ", chargePoint)

	if db == nil {
		logln("❌", debugPrefix+"db is nil")
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		logln("❌", debugPrefix+"chargePoint is empty")
		return fmt.Errorf("chargePoint is required")
	}

	// ✅ ไม่ print START/FOUND ต่าง ๆ แล้ว (ย้ายไป verbose ถ้าต้อง debug)
	vlogf("%sSTART energyWh=%.2f tx=%d ts=%s\n",
		debugPrefix,
		energyWh,
		extractTransactionIDFromMeterValues(meterPayload),
		extractTimestampFromMeterValues(meterPayload),
	)

	// 1) หา ChargingSession ที่ตรงกับ chargePoint จริง ๆ
	sess, ok, err := findActiveSessionByChargePoint(db, chargePoint)
	if err != nil || !ok {
		if err == gorm.ErrRecordNotFound {
			vlogln(debugPrefix + "NO ChargingSession(status=true) matched this chargePoint -> skip broadcast")
			return nil
		}
		logln(debugPrefix+"findActiveSessionByChargePoint error:", err)
		return fmt.Errorf("findActiveSessionByChargePoint failed: %w", err)
	}

	vlogf("%sFOUND sessionID=%d status=%v paymentID=%d startEnergy=%.2fWh\n",
		debugPrefix, sess.ID, sess.Status, sess.PaymentID, sess.StartEnergy)

	if sess.PaymentID == 0 {
		vlogln(debugPrefix + "session.PaymentID=0 -> skip")
		return nil
	}

	// ไม่ให้กระทบ flow หลัก
	if err := extendSessionExpiresAtIfNeeded(db, &sess, chargePoint); err != nil {
		vlogln(debugPrefix+"❌ extendSessionExpiresAtIfNeeded error:", err)
	}

	// 2) หา EVCabinet จาก chargePoint
	var cab entity.EVCabinet
	if err := db.Where("charge_point = ?", chargePoint).First(&cab).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			vlogln(debugPrefix + "NO EVCabinet with this charge_point -> skip")
			return nil
		}
		logln(debugPrefix+"find EVCabinet error:", err)
		return fmt.Errorf("find EVCabinet by charge_point failed: %w", err)
	}
	vlogf("%sFOUND cabinetID=%d name=%s chargePoint=%s\n",
		debugPrefix, cab.ID, cab.Name, cab.ChargePoint)

	// 3) โหลด Payment ด้วย PaymentID จาก session (พร้อม EVChargingPayments)
	var pay entity.Payment
	if err := db.Preload("EVChargingPayments").First(&pay, sess.PaymentID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			vlogln(debugPrefix + "NO Payment by session.PaymentID -> skip")
			return nil
		}
		logln(debugPrefix+"find Payment error:", err)
		return fmt.Errorf("find Payment by id failed: %w", err)
	}

	if pay.EVCabinetID == nil {
		vlogln(debugPrefix + "Payment.EVCabinetID is nil -> skip")
		return nil
	}

	vlogf("%sFOUND paymentID=%d amount=%.2f ref=%s ev_cabinet_id=%d evChargingPayments=%d\n",
		debugPrefix, pay.ID, pay.Amount, pay.ReferenceNumber, *pay.EVCabinetID, len(pay.EVChargingPayments))

	if *pay.EVCabinetID != cab.ID {
		vlogf("%sPayment cabinet mismatch -> payment.ev_cabinet_id=%d แต่ cabinet.id=%d -> SKIP\n",
			debugPrefix, *pay.EVCabinetID, cab.ID)
		return nil
	}

	// 4) สร้างรายการ power + รวม totalPowerKwh
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

		// ✅ (3) ITEM — ให้ print บน server ตามที่ต้องการ
		logf("%sITEM evchargingID=%d name=%s power=%s kWh remaining=%s kWh\n",
			debugPrefix, it.EVchargingID, name, powerStr, remStr)

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

	// 5) คิด percent
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
	} else {
		vlogf("%s⚠️ cannot calculate percent (startEnergyWh=%.2f totalPowerWh=%.2f)\n",
			debugPrefix, startEnergyWh, totalPowerWh)
	}

	// ✅ (4) CALC — ให้ print บน server ตามที่ต้องการ
	logf("%sCALC startEnergyWh=%.2f totalPowerKwh=%.2f(totalWh=%.2f) endEnergyWh=%.2f currentWh=%.2f usedWh=%.2f used%%=%.2f remainingWh=%.2f remaining%%=%.2f\n",
		debugPrefix, startEnergyWh, totalPowerKwh, totalPowerWh, endEnergyWh, energyWh, usedWh, usedPercent, remainingWh, remainingPercent)

	// 6) auto stop (ถ้าต้องการลด log ต่อ ก็ปล่อยให้เป็น verbose ได้)
	if totalPowerWh > 0 && startEnergyWh > 0 && rawUsedPercent >= 100.0 {
		if markAutoStopped(sess.ID) {
			vlogf("%s🛑 AUTO STOP TRIGGERED (sessionID=%d usedRaw=%.4f%%)\n", debugPrefix, sess.ID, rawUsedPercent)

			txID, hasTx := getTransactionID(chargePoint)
			if !hasTx || txID <= 0 {
				txID = extractTransactionIDFromMeterValues(meterPayload)
			}

			if txID > 0 {
				if err := SendRemoteStopTransaction(chargePoint, txID); err != nil {
					logln(debugPrefix+"❌ AUTO RemoteStop failed:", err)
				} else {
					vlogf("%s✅ AUTO RemoteStop sent (txID=%d)\n", debugPrefix, txID)
					broadcastLogTextToFrontendRoom(chargePoint, fmt.Sprintf(
						"[AUTO-STOP] chargePoint=%s sessionID=%d txID=%d used=%.2f%% -> sent RemoteStop\n",
						chargePoint, sess.ID, txID, usedPercent,
					))
				}
			} else {
				vlogln(debugPrefix + "⚠️ AUTO STOP: txID not found -> skip SendRemoteStopTransaction")
			}

			if err := closeSessionByID(db, sess.ID); err != nil {
				logln(debugPrefix+"❌ closeSessionByID error:", err)
			} else {
				vlogf("%s✅ session closed (EndTime set + status=false) sessionID=%d\n", debugPrefix, sess.ID)
				broadcastLogTextToFrontendRoom(chargePoint, fmt.Sprintf(
					"[SESSION-CLOSED] chargePoint=%s sessionID=%d -> EndTime updated & status=false\n",
					chargePoint, sess.ID,
				))
			}
		}
	}

	// 7) DATA JSON (ห้ามโดนปิด)
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
		logln(debugPrefix+"marshal error:", err)
		return fmt.Errorf("marshal meter_values_payment_info failed: %w", err)
	}

	// ✅ (5) BROADCAST — ให้ print บน server ตามที่ต้องการ
	logf("%sBROADCAST -> room=%s bytes=%d items=%d\n", debugPrefix, chargePoint, len(b), len(items))

	broadcastToFrontendRoom(chargePoint, b)

	// ลด log เพิ่มเติม (บรรทัด [PERCENT]) -> เอาไปไว้ verbose
	vlogf("%s[PERCENT] chargePoint=%s start=%.2fWh total=%.2fWh end=%.2fWh now=%.2fWh used=%.2fWh (%.2f%%) remaining=%.2fWh (%.2f%%)\n",
		debugPrefix, chargePoint, startEnergyWh, totalPowerWh, endEnergyWh, energyWh, usedWh, usedPercent, remainingWh, remainingPercent)

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
