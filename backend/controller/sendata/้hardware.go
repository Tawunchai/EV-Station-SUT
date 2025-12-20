package hardware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	// 👇 ใช้ module path โปรเจกต์ของคุณ
	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
)

// ======================================================
// 🔧 WebSocket Upgrader
// ======================================================
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ======================================================
// 🌐 เก็บ client ทั้งสองฝั่ง (frontend + hardware)
//    - frontendClients: แยกตาม deviceID เหมือน solar
//    - hardwareClients: hardware ต่อเข้ามาทีละตัวตาม deviceID
// ======================================================
var (
	hardwareMu      sync.Mutex
	frontendClients = make(map[string]map[*websocket.Conn]bool) // deviceID → set ของ conn
	hardwareClients = make(map[string]*websocket.Conn)          // deviceID → conn
)

// ======================================================
// 💻 FRONTEND — React Dashboard
//    ws://host/hardware/frontend?deviceID=hardware_001
// ======================================================
func HandleFrontend(c *gin.Context) {
	// 📌 frontend ต้องระบุ deviceID ที่อยากดู
	deviceID := c.Query("deviceID")
	if strings.TrimSpace(deviceID) == "" {
		fmt.Println("❌ Frontend missing deviceID query param (use /hardware/frontend?deviceID=hardware_001)")
		c.Status(http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Println("❌ Upgrade frontend error:", err)
		return
	}
	defer conn.Close()

	// ✅ ผูก connection นี้กับ deviceID (เหมือน solar.HandleFrontend)
	hardwareMu.Lock()
	if frontendClients[deviceID] == nil {
		frontendClients[deviceID] = make(map[*websocket.Conn]bool)
	}
	frontendClients[deviceID][conn] = true
	hardwareMu.Unlock()

	fmt.Println("💻 Frontend connected for hardware device:", deviceID)

	// รอ message จาก frontend:
	// - ถ้า disconnect → ลบออกจาก group
	// - ถ้าส่ง JSON ที่มี device_id / command → ส่งคำสั่งไป hardware
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			// frontend ปิด หรือ connection หลุด
			hardwareMu.Lock()
			if conns, ok := frontendClients[deviceID]; ok {
				delete(conns, conn)
				if len(conns) == 0 {
					delete(frontendClients, deviceID)
				}
			}
			hardwareMu.Unlock()

			fmt.Println("❌ Frontend disconnected for hardware device:", deviceID)
			break
		}

		// Frontend ส่งคำสั่งมา → เด้งไปหา hardware
		var data map[string]interface{}
		if err := json.Unmarshal(msg, &data); err == nil {
			// ถ้าใน message มี device_id ให้ override; ถ้าไม่มีก็ใช้ deviceID จาก query
			targetDeviceID := deviceID
			if d, ok := data["device_id"].(string); ok && strings.TrimSpace(d) != "" {
				targetDeviceID = d
			}

			if payload, ok := data["command"]; ok {
				SendCommandToHardware(targetDeviceID, payload)
			}
		}
	}
}

// ======================================================
// 🔋 HARDWARE — ESP32 / Solar / EV Controller
//    ws://host/hardware/:deviceID
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
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ready"))

		var jsonData map[string]interface{}
		if err := json.Unmarshal(msg, &jsonData); err != nil {
			fmt.Println("❌ Invalid JSON from hardware:", err)
			continue
		}

		// ฝัง device_id ลง payload ด้วย (เหมือน solar)
		jsonData["device_id"] = deviceID

		enriched, err := json.Marshal(jsonData)
		if err != nil {
			fmt.Println("❌ Cannot marshal enriched hardware data:", err)
			continue
		}

		fmt.Printf("📦 Data from '%s': %s\n", deviceID, string(enriched))

		// 🧠 ถ้าเป็น message type = "remaining_energy" → อัปเดต RemainingPower ใน DB
		// ❗ NOTE: ตัด "คิดเงินคืน/คืน coin ให้ลูกค้า" ออกแล้ว ตามที่ขอ
		msgType, _ := jsonData["type"].(string)
		if msgType == "remaining_energy" {
			go handleRemainingEnergyMessage(jsonData)
		}

		// ส่งข้อมูลจาก hardware → frontend เฉพาะที่ subscribe deviceID นี้
		broadcastToFrontend(deviceID, enriched)
	}
}

// ======================================================
// 📤 Broadcast Hardware → Frontend (แยกตาม deviceID)
// ======================================================
func broadcastToFrontend(deviceID string, msg []byte) {
	hardwareMu.Lock()
	defer hardwareMu.Unlock()

	conns, ok := frontendClients[deviceID]
	if !ok {
		// ไม่มีใคร subscribe deviceID นี้อยู่
		return
	}

	for client := range conns {
		if err := client.WriteMessage(websocket.TextMessage, msg); err != nil {
			client.Close()
			delete(conns, client)
		}
	}

	if len(conns) == 0 {
		delete(frontendClients, deviceID)
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
		"type":    "command",
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
	DeviceID      string   `json:"device_id"`
	PaymentID     string   `json:"payment_id"`      // ⭐ รับเป็น string (จะได้ยืดหยุ่น)
	EnergySources []string `json:"energy_sources"` // ⭐ เช่น ["Solar", "Grid"]
}

func RequestEnergyUsage(c *gin.Context) {
	var body EnergyRequest

	if err := c.ShouldBindJSON(&body); err != nil || body.DeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "device_id is required",
		})
		return
	}

	// 🧠 คำสั่งที่ต้องการส่งไป hardware + แนบ payment_id + energy_sources
	command := map[string]interface{}{
		"command":        "get_remaining_energy",
		"payment_id":     body.PaymentID,
		"energy_sources": body.EnergySources, // เช่น ["Solar", "Grid"]
	}

	// ยังเก็บรูปแบบเดิม คือส่ง payload เป็น JSON string (แต่ถูก marshal อีกชั้นใน SendCommandToHardware)
	jsonCmd, _ := json.Marshal(command)

	// ส่งคำสั่งถึง hardware
	SendCommandToHardware(body.DeviceID, jsonCmd)

	c.JSON(http.StatusOK, gin.H{
		"message":        "command sent to hardware",
		"device_id":      body.DeviceID,
		"payment_id":     body.PaymentID,
		"energy_sources": body.EnergySources,
	})
}

// ======================================================
// 🧠 Handle remaining_energy message จาก hardware
//    {"type":"remaining_energy","payload":{"Solar":10,"Grid":10},"payment_id":"245"}
//    - payload = พลังงานที่เหลือ (kWh) → บันทึกลง RemainingPower
//
// ✅ ตัด "คิดเงินคืน/คืน coin ให้ลูกค้า" ออกแล้ว (ไม่กระทบ flow อื่น)
// ======================================================
func handleRemainingEnergyMessage(jsonData map[string]interface{}) {
	// 1) ดึง payment_id
	rawPaymentID, ok := jsonData["payment_id"]
	if !ok {
		fmt.Println("⚠️ remaining_energy message missing payment_id")
		return
	}

	paymentStr := fmt.Sprintf("%v", rawPaymentID)
	paymentUint64, err := strconv.ParseUint(paymentStr, 10, 64)
	if err != nil {
		fmt.Println("⚠️ cannot parse payment_id:", paymentStr, "err:", err)
		return
	}
	paymentID := uint(paymentUint64)

	// 2) ดึง payload เป็น map[string]float64
	payloadRaw, ok := jsonData["payload"]
	if !ok {
		fmt.Println("⚠️ remaining_energy message missing payload")
		return
	}

	payloadMap, ok := payloadRaw.(map[string]interface{})
	if !ok {
		fmt.Printf("⚠️ remaining_energy payload is not an object: %#v\n", payloadRaw)
		return
	}

	db := config.DB()

	// 3) โหลด EVChargingPayment ของ PaymentID นี้ พร้อม EVcharging + EnergySource
	//    (ยัง preload เหมือนเดิม เผื่อใช้ match sourceName)
	var evPays []entity.EVChargingPayment
	if err := db.
		Preload("EVcharging").
		Preload("EVcharging.EnergySource").
		Where("payment_id = ?", paymentID).
		Find(&evPays).Error; err != nil {

		fmt.Println("❌ DB error while loading EVChargingPayment:", err)
		return
	}

	if len(evPays) == 0 {
		fmt.Println("ℹ️ No EVChargingPayment found for payment_id =", paymentID)
		return
	}

	fmt.Printf("🔍 Found %d EVChargingPayment rows for payment_id=%d\n", len(evPays), paymentID)

	// 4) loop ทีละ source ใน payload เช่น Solar / Grid
	//    แล้ว UPDATE remaining_power ลง DB ให้แถวที่ energy source ตรงกัน
	updatedCount := 0

	for sourceName, remainingVal := range payloadMap {
		// JSON number → float64
		remainingKwh, ok := remainingVal.(float64)
		if !ok {
			fmt.Printf("⚠️ value for source %s is not number: %#v\n", sourceName, remainingVal)
			continue
		}

		fmt.Printf("⚡ Remaining energy from payload: source=%s remaining=%.3f kWh\n", sourceName, remainingKwh)

		// หา EVChargingPayment ที่ EnergySource.Name ตรงกับ key
		for i := range evPays {
			p := &evPays[i]

			if p.EVcharging.EnergySource == nil {
				continue
			}

			if p.EVcharging.EnergySource.Name != sourceName {
				continue
			}

			// payload = พลังงานที่เหลืออยู่แล้ว → บันทึกลง RemainingPower ตรง ๆ
			p.RemainingPower = remainingKwh

			// UPDATE RemainingPower ลง DB
			if err := db.Model(&entity.EVChargingPayment{}).
				Where("id = ?", p.ID).
				Update("remaining_power", remainingKwh).Error; err != nil {

				fmt.Printf("❌ Failed to update RemainingPower for EVChargingPayment ID=%d: %v\n", p.ID, err)
			} else {
				updatedCount++
				fmt.Printf("✅ Updated RemainingPower: EVChargingPayment ID=%d, Source=%s, Power=%.3f, Remaining=%.3f\n",
					p.ID,
					sourceName,
					p.Power,
					remainingKwh,
				)
			}
		}
	}

	fmt.Printf("✅ RemainingPower update done: payment_id=%d updated_rows=%d (refund logic removed)\n", paymentID, updatedCount)
}

// =======================================================
// ✅ GET /hardwares  → ListHardwares
// =======================================================
func ListHardwares(c *gin.Context) {
	db := config.DB()

	var hardwares []entity.Hardware
	if err := db.Find(&hardwares).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูล Hardware ได้: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": hardwares,
	})
}

// =======================================================
// ✅ POST /create-hardware  → CreateHardware
// =======================================================
func CreateHardware(c *gin.Context) {
	db := config.DB()

	var hw entity.Hardware
	if err := c.ShouldBindJSON(&hw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// ตรวจสอบชื่อซ้ำ (ไม่สนตัวพิมพ์)
	if hw.Name != "" {
		var existingByName entity.Hardware
		if err := db.Where("LOWER(name) = ?", strings.ToLower(hw.Name)).First(&existingByName).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อ Hardware นี้มีอยู่แล้ว"})
			return
		}
	}

	// ตรวจสอบ HardwarePoint ซ้ำ (ไม่สนตัวพิมพ์)
	if hw.HardwarePoint != "" {
		var existingByPoint entity.Hardware
		if err := db.Where("LOWER(hardware_point) = ?", strings.ToLower(hw.HardwarePoint)).First(&existingByPoint).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "HardwarePoint นี้ถูกใช้แล้ว"})
			return
		}
	}

	if err := db.Create(&hw).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้าง Hardware ได้: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "สร้าง Hardware สำเร็จ",
		"data":    hw,
	})
}

// =======================================================
// ✅ PATCH /update-hardware/:id  → UpdateHardwareByID
// =======================================================
func UpdateHardwareByID(c *gin.Context) {
	id := c.Param("id")
	db := config.DB()

	var hw entity.Hardware
	if err := db.First(&hw, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบ Hardware ที่ต้องการแก้ไข"})
		return
	}

	var input entity.Hardware
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// ตรวจสอบชื่อซ้ำ (ยกเว้นตัวเอง)
	if input.Name != "" {
		var existingByName entity.Hardware
		if err := db.Where("LOWER(name) = ? AND id != ?", strings.ToLower(input.Name), id).
			First(&existingByName).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อ Hardware นี้มีอยู่แล้ว"})
			return
		}
	}

	// ตรวจสอบ HardwarePoint ซ้ำ (ยกเว้นตัวเอง)
	if input.HardwarePoint != "" {
		var existingByPoint entity.Hardware
		if err := db.Where("LOWER(hardware_point) = ? AND id != ?", strings.ToLower(input.HardwarePoint), id).
			First(&existingByPoint).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "HardwarePoint นี้ถูกใช้แล้ว"})
			return
		}
	}

	// อัปเดตฟิลด์
	hw.Name = input.Name
	hw.HardwarePoint = input.HardwarePoint
	hw.UrlWebsocket = input.UrlWebsocket

	if err := db.Save(&hw).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถอัปเดต Hardware ได้: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "อัปเดต Hardware สำเร็จ",
		"data":    hw,
	})
}

// =======================================================
// ✅ DELETE /hardware/:id  → DeleteHardwareByID
// =======================================================
func DeleteHardwareByID(c *gin.Context) {
	id := c.Param("id")
	db := config.DB()

	var hw entity.Hardware
	if err := db.Preload("EVCabinet").First(&hw, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบ Hardware"})
		return
	}

	// ป้องกันการลบ ถ้ามี EVCabinet ผูกอยู่ (กันระบบพัง)
	if len(hw.EVCabinet) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "ไม่สามารถลบ Hardware นี้ได้ เนื่องจากมีตู้ชาร์จ (EVCabinet) ที่เชื่อมอยู่",
		})
		return
	}

	if err := db.Delete(&hw).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถลบ Hardware ได้: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ลบ Hardware สำเร็จ",
	})
}
