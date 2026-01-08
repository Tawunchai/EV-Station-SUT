package solar

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/datatypes"
)

// ============================================================================
// ✅ LOG SWITCH (ปิด log เพื่อไม่ให้หนัก server)
// - default: ปิด (0)
// - เปิดได้ด้วย env: SOLAR_LOG=1 / true / on
// ============================================================================
var solarLogEnabled uint32 = 0

func init() {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SOLAR_LOG")))
	if v == "1" || v == "true" || v == "on" || v == "yes" {
		atomic.StoreUint32(&solarLogEnabled, 1)
	}
}

func isSolarLogEnabled() bool {
	return atomic.LoadUint32(&solarLogEnabled) == 1
}

func solarLogln(args ...interface{}) {
	if !isSolarLogEnabled() {
		return
	}
	fmt.Println(args...)
}

// ============================================================================
// ✅ WebSocket Upgrader
// ============================================================================
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ✅ เก็บ frontend connections แยกตาม deviceID
// key = deviceID (เช่น "solar_001"), value = set ของ connection
var (
	solarClients   = make(map[string]map[*websocket.Conn]bool)
	solarClientsMu sync.Mutex
)

// ============================================================================
// 🔹 FRONTEND — สำหรับเว็บ Dashboard (เลือก device ที่จะดู)
//    ws://host/solar/frontend?deviceID=solar_001
// ============================================================================
func HandleFrontend(c *gin.Context) {
	// 📌 frontend ต้องบอกว่าอยากดู device ตัวไหน ผ่าน query ?deviceID=
	deviceID := c.Query("deviceID")
	if deviceID == "" {
		// ✅ เงียบ: ไม่ print (กัน log หนัก)
		c.Status(http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		// ✅ เงียบ: ไม่ print
		return
	}
	defer conn.Close()

	// ✅ ผูก connection นี้กับ deviceID ที่เลือก
	solarClientsMu.Lock()
	if solarClients[deviceID] == nil {
		solarClients[deviceID] = make(map[*websocket.Conn]bool)
	}
	solarClients[deviceID][conn] = true
	solarClientsMu.Unlock()

	// ✅ (ถ้าจะ debug ค่อยเปิด SOLAR_LOG=1)
	solarLogln("🌐 Frontend connected to Solar stream for device:", deviceID)

	// รอจน frontend ปิด connection เอง หรือหลุด
	for {
		if _, _, err := conn.NextReader(); err != nil {
			solarClientsMu.Lock()
			// ลบ conn ออกจาก group ของ device นี้
			delete(solarClients[deviceID], conn)
			if len(solarClients[deviceID]) == 0 {
				delete(solarClients, deviceID)
			}
			solarClientsMu.Unlock()

			solarLogln("❌ Frontend disconnected from Solar stream for device:", deviceID)
			break
		}
	}
}

// ============================================================================
// 🔹 HARDWARE / SOLAR DEVICE — สำหรับอุปกรณ์ที่ส่งข้อมูลเข้ามา
//    ws://host/solar/solar_001
// ============================================================================
func HandleSolar(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		// ✅ เงียบ: ไม่ print
		return
	}
	defer conn.Close()

	deviceID := c.Param("deviceID")
	solarLogln("🔋 Solar device connected:", deviceID)

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			solarLogln("⚠️  Solar device disconnected:", deviceID)
			break
		}

		// ✅ ตอบกลับ hardware ว่าเราโอเค (ยังทำเหมือนเดิม)
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ready"))

		// ✅ ไม่ print log ที่หนัก:
		// - "📤 [WS] Sent data: {...}"
		// - "📩 [WS] Server response: ready"
		// - "📦 Solar Data Received ..." (payload ยาว)
		// ดังนั้นโค้ดยัง parse + broadcast เหมือนเดิม แต่เงียบ

		// ตรวจสอบ JSON ที่เข้ามา
		var jsonData map[string]interface{}
		if err := json.Unmarshal(msg, &jsonData); err != nil {
			// ✅ เงียบ: ไม่ print (ถ้าจะ debug เปิด SOLAR_LOG)
			solarLogln("❌ Invalid JSON from solar:", err)
			continue
		}

		// ✅ ฝัง device_id ลงใน payload ด้วย (จะได้รู้ว่ามาจากตัวไหน)
		jsonData["device_id"] = deviceID

		enriched, err := json.Marshal(jsonData)
		if err != nil {
			// ✅ เงียบ
			solarLogln("❌ Cannot marshal enriched solar data:", err)
			continue
		}

		// ✅ ถ้าจะ debug ค่อยเปิด SOLAR_LOG
		// solarLogln("📦 Solar Data Received from", deviceID, ":", string(enriched))

		// ✅ ส่งข้อมูลเฉพาะให้ frontend ที่ subscribe deviceID นี้
		broadcastToFrontend(deviceID, enriched)
	}
}

// ============================================================================
// 🔸 Broadcast ข้อมูลไปยัง frontend ที่ดู deviceID ตรงกันเท่านั้น
// ============================================================================
func broadcastToFrontend(deviceID string, msg []byte) {
	solarClientsMu.Lock()
	defer solarClientsMu.Unlock()

	clients, ok := solarClients[deviceID]
	if !ok {
		// ตอนนี้ไม่มีใคร subscribe device นี้อยู่
		return
	}

	for client := range clients {
		if err := client.WriteMessage(websocket.TextMessage, msg); err != nil {
			client.Close()
			delete(clients, client)
		}
	}

	if len(clients) == 0 {
		delete(solarClients, deviceID)
	}
}

// ==============================
//   LIST ALL SOLAR
// ==============================
func ListSolar(c *gin.Context) {
	var solars []entity.Solar

	db := config.DB()
	if err := db.Find(&solars).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, solars)
}

//
// ==============================
//   CREATE SOLAR
// ==============================
//
func CreateSolar(c *gin.Context) {
	db := config.DB()

	// รับข้อมูลจาก form (multipart/form-data)
	name := c.PostForm("name")
	urlWS := c.PostForm("url_websocket")
	solarPoint := c.PostForm("solar_point")
	description := c.PostForm("description")
	location := c.PostForm("location")

	if name == "" || urlWS == "" || solarPoint == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกข้อมูลให้ครบ Name, UrlWebsocket, SolarPoint"})
		return
	}

	// ---- จัดการรูปภาพ (picture) แบบ News ----
	var filePath string

	file, err := c.FormFile("picture")
	if err == nil && file != nil {
		// ตรวจสอบประเภทไฟล์
		validTypes := []string{"image/jpeg", "image/png", "image/gif"}
		isValid := false
		contentType := file.Header.Get("Content-Type")
		for _, t := range validTypes {
			if contentType == t {
				isValid = true
				break
			}
		}
		if !isValid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปภาพต้องเป็นไฟล์ .jpg, .png, .gif เท่านั้น"})
			return
		}

		// สร้างโฟลเดอร์ uploads/solar ถ้ายังไม่มี
		uploadDir := "uploads/solar"
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์เก็บไฟล์ได้"})
			return
		}

		// สร้างชื่อไฟล์ใหม่กันชื่อซ้ำ
		ext := filepath.Ext(file.Filename)
		newFileName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		filePath = filepath.Join(uploadDir, newFileName)

		// บันทึกไฟล์
		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		// ตอนนี้จะปล่อยให้ว่างได้
		filePath = "" // ไม่มีรูป
	}

	s := entity.Solar{
		Name:         name,
		UrlWebsocket: urlWS,
		SolarPoint:   solarPoint,
		Description:  description,
		Location:     location,
		Picture:      filePath, // เก็บ path รูป
	}

	if err := db.Create(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Solar created successfully",
		"data":    s,
	})
}

//
// ==============================
//   UPDATE SOLAR BY ID
// ==============================
//
func UpdateSolarByID(c *gin.Context) {
	id := c.Param("id")

	db := config.DB()
	var s entity.Solar

	// ตรวจสอบว่ามี record?
	if err := db.First(&s, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูล Solar"})
		return
	}

	// รับค่าใหม่จาก form
	name := c.PostForm("name")
	urlWS := c.PostForm("url_websocket")
	solarPoint := c.PostForm("solar_point")
	description := c.PostForm("description")
	location := c.PostForm("location")

	// อัปโหลดรูปใหม่ (ถ้ามี)
	file, err := c.FormFile("picture")
	if err == nil && file != nil {
		validTypes := []string{"image/jpeg", "image/png", "image/gif"}
		isValid := false
		contentType := file.Header.Get("Content-Type")
		for _, t := range validTypes {
			if contentType == t {
				isValid = true
				break
			}
		}
		if !isValid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปภาพต้องเป็น .jpg, .png, .gif เท่านั้น"})
			return
		}

		uploadDir := "uploads/solar"
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์เก็บไฟล์ได้"})
			return
		}

		ext := filepath.Ext(file.Filename)
		newFileName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		filePath := filepath.Join(uploadDir, newFileName)

		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		s.Picture = filePath // อัปเดตรูปใหม่
	}

	// อัปเดต field ที่ส่งมา (ถ้ามี)
	if name != "" {
		s.Name = name
	}
	if urlWS != "" {
		s.UrlWebsocket = urlWS
	}
	if solarPoint != "" {
		s.SolarPoint = solarPoint
	}
	if description != "" {
		s.Description = description
	}
	if location != "" {
		s.Location = location
	}

	// บันทึก
	if err := db.Save(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "อัปเดตข้อมูล Solar สำเร็จ",
		"data":    s,
	})
}

//
// ==============================
//   DELETE SOLAR BY ID
// ==============================
//
func DeleteSolarByID(c *gin.Context) {
	id := c.Param("id")

	db := config.DB()
	var s entity.Solar

	if err := db.First(&s, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solar not found"})
		return
	}

	if err := db.Delete(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Solar deleted"})
}

//
// ==============================
//   GET SOLAR BY ID
// ==============================
//
func GetSolarByID(c *gin.Context) {
	id := c.Param("id")

	var s entity.Solar
	db := config.DB()

	if err := db.First(&s, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solar not found"})
		return
	}

	c.JSON(http.StatusOK, s)
}

// ==============================
// Request structs
// ==============================
type SolarRealtimePayloadData struct {
	PowerIn           float64       `json:"power_in"`
	PowerOut          float64       `json:"power_out"`
	BatteryPercentage float64       `json:"battery_percentage"`
	BatteryPower      float64       `json:"battery_power"`
	GridPower         float64       `json:"grid_power"` // ✅ เพิ่ม field นี้
	Voltage           float64       `json:"voltage"`
	Current           float64       `json:"current"`
	SolarIrradiance   float64       `json:"solar_irradiance"`
	Temperature       float64       `json:"temperature"`
	PanelTemperature  float64       `json:"panel_temperature"`
	Efficiency        float64       `json:"efficiency"`
	Frequency         float64       `json:"frequency"`
	DailyEnergy       float64       `json:"daily_energy"`
	TotalEnergy       float64       `json:"total_energy"`
	Status            string        `json:"status"`
	Alerts            []interface{} `json:"alerts"` // []string ก็ได้ ถ้ารูปแบบ fix แน่นอน
}

type SolarRealtimePayload struct {
	DeviceID  string                   `json:"device_id"`
	Timestamp string                   `json:"timestamp"` // รับมาเป็น string แล้วค่อย parse ทีหลัง
	Data      SolarRealtimePayloadData `json:"data"`
}

type CreateSolarRealtimeRequest struct {
	Type    string               `json:"type"`
	Payload SolarRealtimePayload `json:"payload"`
}

// ==============================
// Controller: POST /solar/realtime
// ==============================
func CreateSolarRealtimeData(c *gin.Context) {
	var req CreateSolarRealtimeRequest

	// 1) Bind JSON จาก body
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบ JSON ไม่ถูกต้อง", "detail": err.Error()})
		return
	}

	// (ถ้าอยากบังคับ type = "realtime")
	if req.Type != "realtime" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type ต้องเป็น realtime เท่านั้น"})
		return
	}

	// 2) แปลง timestamp จาก string → time.Time (ลองหลาย layout)
	var ts time.Time
	layouts := []string{
		time.RFC3339Nano,             // เช่น 2025-11-18T13:30:01.628179Z
		"2006-01-02T15:04:05.999999", // แบบไม่มี timezone ตามตัวอย่าง
		"2006-01-02T15:04:05",        // แบบไม่มี microsecond
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, req.Payload.Timestamp); err == nil {
			ts = t
			break
		}
	}

	if ts.IsZero() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "timestamp ไม่ถูกต้อง", "value": req.Payload.Timestamp})
		return
	}

	// 3) แปลง alerts → datatypes.JSON
	alertBytes, err := json.Marshal(req.Payload.Data.Alerts)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถแปลง alerts เป็น JSON ได้", "detail": err.Error()})
		return
	}

	// 4) สร้าง entity.SolarRealtimeData จาก request
	solarData := entity.SolarRealtimeData{
		DeviceID:          req.Payload.DeviceID,
		Timestamp:         ts,
		PowerIn:           req.Payload.Data.PowerIn,
		PowerOut:          req.Payload.Data.PowerOut,
		BatteryPercentage: req.Payload.Data.BatteryPercentage,
		BatteryPower:      req.Payload.Data.BatteryPower,
		GridPower:         req.Payload.Data.GridPower, // ✅ map ค่า grid_power
		Voltage:           req.Payload.Data.Voltage,
		Current:           req.Payload.Data.Current,
		SolarIrradiance:   req.Payload.Data.SolarIrradiance,
		Temperature:       req.Payload.Data.Temperature,
		PanelTemperature:  req.Payload.Data.PanelTemperature,
		Efficiency:        req.Payload.Data.Efficiency,
		Frequency:         req.Payload.Data.Frequency,
		DailyEnergy:       req.Payload.Data.DailyEnergy,
		TotalEnergy:       req.Payload.Data.TotalEnergy,
		Status:            req.Payload.Data.Status,
		Alerts:            datatypes.JSON(alertBytes),
	}

	// 5) บันทึกลงฐานข้อมูล
	if err := config.DB().Create(&solarData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกข้อมูลได้", "detail": err.Error()})
		return
	}

	// 6) ตอบกลับ
	c.JSON(http.StatusCreated, gin.H{
		"message": "Solar realtime data created successfully",
		"data":    solarData,
	})
}

// GET /api/solar/realtime/:device_id
func ListSolarRealtimeDataByDeviceID(c *gin.Context) {
	deviceID := c.Param("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id ห้ามเป็นค่าว่าง"})
		return
	}

	var records []entity.SolarRealtimeData

	db := config.DB()
	result := db.
		Where("device_id = ?", deviceID).
		Order("timestamp DESC").
		Find(&records)

	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, records)
}

// DELETE /api/solar/realtime
func DeleteSolarRealtimeDataByIDs(c *gin.Context) {
	// โครงสร้างรับ body: { "ids": [1,2,3] }
	var req struct {
		IDs []uint `json:"ids"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น JSON ที่มี field ids เป็น array จำนวนเต็ม)",
		})
		return
	}

	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "ต้องส่งรายการ ids มาอย่างน้อย 1 ค่า",
		})
		return
	}

	db := config.DB()

	// ลบตาม id ที่ส่งมา
	result := db.
		Where("id IN ?", req.IDs).
		Delete(&entity.SolarRealtimeData{})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": result.Error.Error(),
		})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "ไม่พบข้อมูลที่ตรงกับ ids ที่ส่งมา",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "ลบข้อมูล SolarRealtimeData สำเร็จ",
		"deleted_count": result.RowsAffected,
		"ids":           req.IDs,
	})
}
