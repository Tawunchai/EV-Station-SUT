package ocpp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ============================================================================
// 🔧 WebSocket Upgrader
// ============================================================================
var upgrader = websocket.Upgrader{
	CheckOrigin:  func(r *http.Request) bool { return true },
	Subprotocols: []string{"ocpp1.6"},
}

// ============================================================================
// 🌐 Frontend WebSocket Clients
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

// ⭐ NEW: โครงสร้างเก็บสถานะล่าสุดของแต่ละตู้
type ChargerStatus struct {
	ChargerID   string `json:"chargerId"`
	ConnectorID int    `json:"connectorId"`
	Status      string `json:"status"`
	ErrorCode   string `json:"errorCode"`
	Connected   bool   `json:"connected"`
}

// ⭐ NEW: map เก็บสถานะของแต่ละตู้
var (
	chargerStatuses = make(map[string]ChargerStatus)
	statusMu        sync.Mutex
)

// สร้าง transaction id ไม่ซ้ำ
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
// 🔹 FRONTEND WebSocket
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

	for {
		if _, _, err := conn.NextReader(); err != nil {
			clientsMu.Lock()
			delete(clients, conn)
			clientsMu.Unlock()
			fmt.Println("❌ Frontend disconnected")
			break
		}
	}
}

// ============================================================================
// 🔹 CHARGER OCPP WebSocket
// ============================================================================
func HandleOCPP(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Println("❌ Upgrade OCPP error:", err)
		return
	}
	defer conn.Close()

	chargerID := c.Param("chargerID")

	chargersMu.Lock()
	chargers[chargerID] = conn
	chargersMu.Unlock()

	fmt.Println("🚗 Charger connected:", chargerID)

	// ⭐ NEW: อัปเดตสถานะว่า "connected"
	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}
	st.Connected = true
	chargerStatuses[chargerID] = st
	statusMu.Unlock()

	defer func() {
		chargersMu.Lock()
		delete(chargers, chargerID)
		chargersMu.Unlock()
		fmt.Println("⚠️ Charger disconnected:", chargerID)

		// ⭐ NEW: อัปเดตสถานะว่า "disconnected" แต่ยังจำ status ล่าสุดไว้
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

		var frame []interface{}
		if err := json.Unmarshal(msg, &frame); err != nil {
			fmt.Println("❌ JSON parse error:", err)
			continue
		}

		if len(frame) < 3 {
			fmt.Println("⚠️ Invalid OCPP frame length:", len(frame))
			continue
		}

		messageTypeFloat, ok := frame[0].(float64)
		if !ok {
			fmt.Println("⚠️ messageType is not number")
			continue
		}
		messageType := int(messageTypeFloat)

		messageID, ok := frame[1].(string)
		if !ok {
			fmt.Println("⚠️ messageId is not string")
			continue
		}

		// สำหรับ CALL (messageType == 2) ช่องที่ 2 คือ Action (string)
		action := ""
		if a, ok := frame[2].(string); ok {
			action = a
		}

		// --------------------------------------------------------------------
		// 📌 CALL from Charger → CSMS
		// --------------------------------------------------------------------
		if messageType == 2 {
			switch action {

			// ---------------------------------------------------------------
			case "BootNotification":
				response := []interface{}{
					3, messageID,
					map[string]interface{}{
						"status":      "Accepted",
						"currentTime": "2025-11-12T12:00:00Z",
						"interval":    30,
					},
				}
				if err := conn.WriteJSON(response); err != nil {
					fmt.Println("❌ Failed to send BootNotification conf:", err)
				} else {
					fmt.Println("✅ BootNotification Accepted")
				}

			// ---------------------------------------------------------------
			case "MeterValues":
				response := []interface{}{3, messageID, map[string]interface{}{}}
				if err := conn.WriteJSON(response); err != nil {
					fmt.Println("❌ Failed to send MeterValues conf:", err)
				} else {
					fmt.Println("📊 MeterValues Acknowledged")
				}

			// ---------------------------------------------------------------
			// ⭐ NEW: รับ StatusNotification จากตู้ แล้วเก็บสถานะไว้
			case "StatusNotification":
				fmt.Println("📥 StatusNotification from", chargerID)

				// payload อยู่ช่องที่ 3
				var connectorID int
				var statusStr, errorCode string

				if len(frame) >= 4 {
					if payload, ok := frame[3].(map[string]interface{}); ok {
						if cid, ok := payload["connectorId"].(float64); ok {
							connectorID = int(cid)
						}
						if s, ok := payload["status"].(string); ok {
							statusStr = s
						}
						if e, ok := payload["errorCode"].(string); ok {
							errorCode = e
						}
					}
				}

				// อัปเดต map สถานะ
				statusMu.Lock()
				old, _ := chargerStatuses[chargerID]
				newSt := ChargerStatus{
					ChargerID:   chargerID,
					ConnectorID: connectorID,
					Status:      statusStr,
					ErrorCode:   errorCode,
					Connected:   true,
				}
				// ถ้าอยากเก็บค่าเก่า ๆ เพิ่มเติม สามารถ merge จาก old ได้
				if old.ChargerID != "" {
					// ตัวอย่าง: ถ้า connectorID ไม่ได้ส่งมา ให้ใช้ค่าเดิม
					if newSt.ConnectorID == 0 {
						newSt.ConnectorID = old.ConnectorID
					}
				}
				chargerStatuses[chargerID] = newSt
				statusMu.Unlock()

				// ส่ง CALLRESULT กลับไปหาตู้
				response := []interface{}{3, messageID, map[string]interface{}{}}
				if err := conn.WriteJSON(response); err != nil {
					fmt.Println("❌ Failed to send StatusNotification conf:", err)
				} else {
					fmt.Printf("✅ StatusNotification stored: %+v\n", newSt)
				}

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
			case "StopTransaction":
				fmt.Println("🛑 StopTransaction received — ending session for", chargerID)

				// ลบ session
				clearTransactionID(chargerID)

				response := []interface{}{
					3, messageID,
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
			}
		}

		// Broadcast ทุก message ไปให้ frontend ดู log
		broadcastToFrontend(msg)
	}
}

// ============================================================================
// 📡 Broadcast
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

// ============================================================================
// 🚀 Send RemoteStartTransaction
// ============================================================================
func SendRemoteStartTransaction(chargerID string, connectorID int, idTag string) error {
	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	if !ok {
		return fmt.Errorf("❌ charger %s not connected", chargerID)
	}

	messageID := fmt.Sprintf("remote-start-%s", chargerID)

	frame := []interface{}{
		2,
		messageID,
		"RemoteStartTransaction",
		map[string]interface{}{
			"connectorId": connectorID,
			"idTag":       idTag,
		},
	}

	if err := conn.WriteJSON(frame); err != nil {
		fmt.Println("❌ Failed to send RemoteStartTransaction:", err)
		return err
	}

	fmt.Println("➡️ RemoteStartTransaction sent to", chargerID)
	return nil
}

// ============================================================================
// ⛔ Send RemoteStopTransaction
// ============================================================================
func SendRemoteStopTransaction(chargerID string, txID int) error {
	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	if !ok {
		return fmt.Errorf("❌ charger %s not connected", chargerID)
	}

	messageID := fmt.Sprintf("remote-stop-%s", chargerID)

	frame := []interface{}{
		2,
		messageID,
		"RemoteStopTransaction",
		map[string]interface{}{
			"transactionId": txID,
		},
	}

	if err := conn.WriteJSON(frame); err != nil {
		fmt.Println("❌ Failed to send RemoteStopTransaction:", err)
		return err
	}

	fmt.Println("➡️ RemoteStopTransaction sent to", chargerID, "txID =", txID)
	return nil
}

// ============================================================================
// ▶ API: RemoteStart
// ============================================================================
type RemoteStartRequest struct {
	ChargerID   string `json:"chargerId"`
	ConnectorID int    `json:"connectorId"`
	IdTag       string `json:"idTag"`
}

func RemoteStartHandler(c *gin.Context) {
	var req RemoteStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	if req.ConnectorID <= 0 {
		req.ConnectorID = 1
	}
	if req.IdTag == "" {
		req.IdTag = "EV-SIM-001"
	}

	if err := SendRemoteStartTransaction(req.ChargerID, req.ConnectorID, req.IdTag); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"message": "RemoteStartTransaction sent"})
}

// ============================================================================
// ▶ API: RemoteStop
// ============================================================================
type RemoteStopRequest struct {
	ChargerID string `json:"chargerId"`
}

func RemoteStopHandler(c *gin.Context) {
	var req RemoteStopRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	txID, ok := getTransactionID(req.ChargerID)
	if !ok {
		c.JSON(400, gin.H{"error": "no active transaction"})
		return
	}

	if err := SendRemoteStopTransaction(req.ChargerID, txID); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"message": "RemoteStopTransaction sent"})
}

// ============================================================================
// ▶ API: Get Current Status (NEW)
// ============================================================================

// GET /ocpp/status/:chargerID
func GetChargerStatusHandler(c *gin.Context) {
	chargerID := c.Param("chargerID")

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	statusMu.Unlock()

	if !ok {
		c.JSON(404, gin.H{"error": "no status for this charger"})
		return
	}

	// double-check ว่ายัง connect อยู่ไหม
	chargersMu.Lock()
	_, connected := chargers[chargerID]
	chargersMu.Unlock()
	st.Connected = connected

	c.JSON(200, gin.H{
		"data": st,
	})
}
