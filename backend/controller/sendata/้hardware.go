package hardware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ======================================================
// 🔧 WebSocket Upgrader
// ======================================================
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ======================================================
// 🌐 เก็บ client ทั้งสองฝั่ง (frontend + hardware)
// ======================================================
var (
	hardwareMu      sync.Mutex
	frontendClients = make(map[*websocket.Conn]bool)
	hardwareClients = make(map[string]*websocket.Conn) // deviceID → conn
)

// ======================================================
// 💻 FRONTEND — React Dashboard
// ======================================================
func HandleFrontend(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Println("❌ Upgrade frontend error:", err)
		return
	}
	defer conn.Close()

	hardwareMu.Lock()
	frontendClients[conn] = true
	hardwareMu.Unlock()

	fmt.Println("💻 Frontend connected")

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			hardwareMu.Lock()
			delete(frontendClients, conn)
			hardwareMu.Unlock()
			fmt.Println("❌ Frontend disconnected")
			break
		}

		// Frontend ส่งคำสั่งมา → เด้งไปหา hardware
		var data map[string]interface{}
		if err := json.Unmarshal(msg, &data); err == nil {
			deviceID, _ := data["device_id"].(string)

			if payload, ok := data["command"]; ok {
				SendCommandToHardware(deviceID, payload)
			}
		}
	}
}

// ======================================================
// 🔋 HARDWARE — ESP32 / Solar Controller
// ======================================================
func HandleHardware(c *gin.Context) {
	deviceID := c.Param("deviceID")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Println("❌ Upgrade hardware error:", err)
		return
	}
	defer conn.Close()

	hardwareMu.Lock()
	hardwareClients[deviceID] = conn
	hardwareMu.Unlock()

	fmt.Printf("🔌 Hardware '%s' connected\n", deviceID)

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			hardwareMu.Lock()
			delete(hardwareClients, deviceID)
			hardwareMu.Unlock()
			fmt.Printf("⚠️ Hardware '%s' disconnected\n", deviceID)
			break
		}

		// แจ้ง hardware ว่าระบบพร้อมรับข้อมูล
		conn.WriteMessage(websocket.TextMessage, []byte("ready"))

		var jsonData map[string]interface{}
		if err := json.Unmarshal(msg, &jsonData); err != nil {
			fmt.Println("❌ Invalid JSON from hardware:", err)
			continue
		}

		fmt.Printf("📦 Data from '%s': %s\n", deviceID, string(msg))

		// ส่งข้อมูลจาก hardware → frontend ทุกตัว
		broadcastToFrontend(msg)
	}
}

// ======================================================
// 📤 Broadcast Hardware → Frontend
// ======================================================
func broadcastToFrontend(msg []byte) {
	hardwareMu.Lock()
	defer hardwareMu.Unlock()

	for client := range frontendClients {
		if err := client.WriteMessage(websocket.TextMessage, msg); err != nil {
			client.Close()
			delete(frontendClients, client)
		}
	}
}

// ======================================================
// 📡 ส่งคำสั่งจากระบบไปที่ hardware เฉพาะตัว
// ======================================================
func SendCommandToHardware(deviceID string, payload interface{}) {
	hardwareMu.Lock()
	defer hardwareMu.Unlock()

	conn, ok := hardwareClients[deviceID]
	if !ok {
		fmt.Printf("⚠️ Hardware '%s' not connected\n", deviceID)
		return
	}

	msg := map[string]interface{}{
		"type": "command",
		"payload": payload,
	}

	jsonMsg, _ := json.Marshal(msg)

	if err := conn.WriteMessage(websocket.TextMessage, jsonMsg); err != nil {
		fmt.Printf("❌ Failed to send command to '%s': %v\n", deviceID, err)
		conn.Close()
		delete(hardwareClients, deviceID)
	} else {
		fmt.Printf("✅ Sent command to '%s': %s\n", deviceID, string(jsonMsg))
	}
}

// ======================================================
// 🆕 Controller API: ขอข้อมูล Solar + Grid จาก Hardware
// ======================================================
type EnergyRequest struct {
	DeviceID string `json:"device_id"`
}

func RequestEnergyUsage(c *gin.Context) {
	var body EnergyRequest

	if err := c.ShouldBindJSON(&body); err != nil || body.DeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "device_id is required",
		})
		return
	}

	// 🧠 คำสั่งที่ต้องการส่งไป hardware
	command := map[string]interface{}{
		"command": "get_energy_usage",
	}

	jsonCmd, _ := json.Marshal(command)

	// ส่งคำสั่งถึง hardware
	SendCommandToHardware(body.DeviceID, jsonCmd)

	c.JSON(http.StatusOK, gin.H{
		"message":   "command sent to hardware",
		"device_id": body.DeviceID,
	})
}
