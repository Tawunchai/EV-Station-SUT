package solar

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ✅ WebSocket Upgrader
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
		// จะให้รับทุกตัวก็ได้ แต่ตอนนี้เราออกแบบให้ต้องระบุชัดเจน
		// ถ้าไม่ระบุ จะไม่ subscribe ใครเลย
		fmt.Println("❌ Frontend missing deviceID query param (use /solar/frontend?deviceID=solar_001)")
		c.Status(http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Println("❌ Upgrade frontend error:", err)
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

	fmt.Println("🌐 Frontend connected to Solar stream for device:", deviceID)

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

			fmt.Println("❌ Frontend disconnected from Solar stream for device:", deviceID)
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
		fmt.Println("❌ Upgrade solar error:", err)
		return
	}
	defer conn.Close()

	deviceID := c.Param("deviceID")
	fmt.Println("🔋 Solar device connected:", deviceID)

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			fmt.Println("⚠️  Solar device disconnected:", deviceID)
			break
		}

		// ตอบกลับ hardware ว่าเราโอเค
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ready"))

		// ตรวจสอบ JSON ที่เข้ามา
		var jsonData map[string]interface{}
		if err := json.Unmarshal(msg, &jsonData); err != nil {
			fmt.Println("❌ Invalid JSON from solar:", err)
			continue
		}

		// ✅ ฝัง device_id ลงใน payload ด้วย (จะได้รู้ว่ามาจากตัวไหน)
		jsonData["device_id"] = deviceID

		enriched, err := json.Marshal(jsonData)
		if err != nil {
			fmt.Println("❌ Cannot marshal enriched solar data:", err)
			continue
		}

		fmt.Println("📦 Solar Data Received from", deviceID, ":", string(enriched))

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


// solar 
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
	name := c.PostForm("name")
	urlWS := c.PostForm("url_websocket")
	solarPoint := c.PostForm("solar_point")

	if name == "" || urlWS == "" || solarPoint == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกข้อมูลให้ครบ Name, UrlWebsocket, SolarPoint"})
		return
	}

	s := entity.Solar{
		Name:         name,
		UrlWebsocket: urlWS,
		SolarPoint:   solarPoint,
	}

	if err := config.DB().Create(&s).Error; err != nil {
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

	var s entity.Solar
	db := config.DB()

	// ตรวจสอบว่ามี record?
	if err := db.First(&s, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูล Solar"})
		return
	}

	// รับค่าใหม่
	name := c.PostForm("name")
	urlWS := c.PostForm("url_websocket")
	solarPoint := c.PostForm("solar_point")

	if name != "" {
		s.Name = name
	}
	if urlWS != "" {
		s.UrlWebsocket = urlWS
	}
	if solarPoint != "" {
		s.SolarPoint = solarPoint
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
