// controller/meter.go
package meter

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"github.com/gorilla/websocket"
)

/* =========================
   REQUEST STRUCTS
========================= */

type CreateMeterRequest struct {
	Name         string `json:"name" binding:"required"`
	UrlWebsocket string `json:"url_websocket" binding:"required"`
	MeterPoint   string `json:"meter_point" binding:"required"`
	Description  string `json:"description"`
}

type UpdateMeterRequest struct {
	// ใช้ pointer เพื่อรองรับ partial update (ส่งมาเฉพาะ field ที่อยากแก้)
	Name         *string `json:"name"`
	UrlWebsocket *string `json:"url_websocket"`
	MeterPoint   *string `json:"meter_point"`
	Description  *string `json:"description"`
}

/* =========================
   CREATE METER
========================= */

func CreateMeter(c *gin.Context) {
	var req CreateMeterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload", "detail": err.Error()})
		return
	}

	// normalize
	req.Name = strings.TrimSpace(req.Name)
	req.UrlWebsocket = strings.TrimSpace(req.UrlWebsocket)
	req.MeterPoint = strings.TrimSpace(req.MeterPoint)
	req.Description = strings.TrimSpace(req.Description)

	if req.Name == "" || req.UrlWebsocket == "" || req.MeterPoint == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, url_websocket, meter_point are required"})
		return
	}

	db := config.DB()

	m := entity.Meter{
		Name:         req.Name,
		UrlWebsocket: req.UrlWebsocket,
		MeterPoint:   req.MeterPoint,
		Description:  req.Description,
	}

	if err := db.Create(&m).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Create meter success",
		"data":    m,
	})
}

/* =========================
   UPDATE METER BY ID
========================= */

func UpdateMeterByID(c *gin.Context) {
	idParam := c.Param("id")
	meterID, err := strconv.Atoi(idParam)
	if err != nil || meterID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid meter ID"})
		return
	}

	var req UpdateMeterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload", "detail": err.Error()})
		return
	}

	db := config.DB()

	// หา meter เดิมก่อน
	var meter entity.Meter
	if err := db.First(&meter, meterID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Meter not found"})
		return
	}

	// สร้าง map สำหรับ update เฉพาะที่ส่งมา
	updates := map[string]interface{}{}

	if req.Name != nil {
		v := strings.TrimSpace(*req.Name)
		if v == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
			return
		}
		updates["Name"] = v
	}
	if req.UrlWebsocket != nil {
		v := strings.TrimSpace(*req.UrlWebsocket)
		if v == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "url_websocket cannot be empty"})
			return
		}
		updates["UrlWebsocket"] = v
	}
	if req.MeterPoint != nil {
		v := strings.TrimSpace(*req.MeterPoint)
		if v == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "meter_point cannot be empty"})
			return
		}
		updates["MeterPoint"] = v
	}
	if req.Description != nil {
		updates["Description"] = strings.TrimSpace(*req.Description)
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}

	if err := db.Model(&meter).Updates(updates).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// ดึงข้อมูลล่าสุดกลับมา
	if err := db.First(&meter, meterID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload meter"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Update meter success",
		"data":    meter,
	})
}

/* =========================
   DELETE METER BY ID
========================= */

func DeleteMeterByID(c *gin.Context) {
	idParam := c.Param("id")
	meterID, err := strconv.Atoi(idParam)
	if err != nil || meterID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid meter ID"})
		return
	}

	db := config.DB()

	var meter entity.Meter
	if err := db.First(&meter, meterID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Meter not found"})
		return
	}

	// ✅ ลบแบบ soft delete (ตาม gorm.Model)
	if err := db.Delete(&meter).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Delete meter success",
		"data": gin.H{
			"id": meterID,
		},
	})
}

/* =========================
   LIST METER
========================= */
func ListMeter(c *gin.Context) {
	var meters []entity.Meter

	db := config.DB()

	if err := db.Find(&meters).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, meters)
}

// Meter Realtime Data

/* =========================================================
   ✅ Helpers: parse timestamp ได้หลายรูปแบบ
   - รองรับ RFC3339 / RFC3339Nano
   - รองรับ "2006-01-02T15:04:05.999999999" (ไม่มี timezone)
========================================================= */

func parseTimestampFlexible(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, nil
	}

	// ลอง RFC3339Nano / RFC3339 ก่อน
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}

	// รูปแบบไม่มี timezone (เช่น 2025-11-18T13:30:01.628179)
	layouts := []string{
		"2006-01-02T15:04:05.999999999",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}

	// ถ้าไม่มีตัวคั่น T แต่อยู่ในรูปแบบอื่น ลอง normalize
	normalized := strings.ReplaceAll(s, " ", "T")
	if t, err := time.Parse("2006-01-02T15:04:05.999999999", normalized); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02T15:04:05", normalized); err == nil {
		return t, nil
	}

	// fallback: ให้ error กลับไป
	return time.Time{}, &time.ParseError{Layout: "flexible timestamp", Value: s, LayoutElem: "", ValueElem: "", Message: "unsupported timestamp format"}
}

/* =========================================================
   ✅ Controller: CreateMeterRealtimeData
   POST /meter-realtime-data
   body:
   {
     "device_id": "solar_001",
     "timestamp": "2025-11-18T13:30:01.628179",
     "w": 123.45,
     "var": 10,
     "va": 150,
     "vrms": 220.12,
     "irms": 0.56
   }
========================================================= */

type createMeterRealtimeDataReq struct {
	DeviceID  string  `json:"device_id" binding:"required"`
	Timestamp string  `json:"timestamp" binding:"required"`
	W         float64 `json:"w"`
	Var       float64 `json:"var"`
	VA        float64 `json:"va"`
	Vrms      float64 `json:"vrms"`
	Irms      float64 `json:"irms"`
}

func CreateMeterRealtimeData(c *gin.Context) {
	db := config.DB()

	var req createMeterRealtimeDataReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON", "details": err.Error()})
		return
	}

	ts, err := parseTimestampFlexible(req.Timestamp)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid timestamp format",
			"example": "2025-11-18T13:30:01.628179 or 2025-11-18T13:30:01.628179Z",
			"details": err.Error(),
		})
		return
	}

	row := entity.MeterRealtimeData{
		DeviceID:  strings.TrimSpace(req.DeviceID),
		Timestamp: ts,
		W:         req.W,
		Var:       req.Var,
		VA:        req.VA,
		Vrms:      req.Vrms,
		Irms:      req.Irms,
	}

	if err := db.Create(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Create failed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Created",
		"data":    row,
	})
}

/* =========================================================
   ✅ Controller: DeleteMeterRealtimeDataByIDs (ลบหลาย ID)
   DELETE /meter-realtime-data
   - แบบ JSON body:
     { "ids": [1,2,3] }
   - หรือแบบ query:
     /meter-realtime-data?ids=1,2,3
   - optional: force=true เพื่อ hard delete (Unscoped)
========================================================= */

type deleteMeterRealtimeDataReq struct {
	IDs []uint `json:"ids" binding:"required"`
}

func DeleteMeterRealtimeDataByIDs(c *gin.Context) {
	db := config.DB()

	// 1) พยายามอ่านจาก JSON body ก่อน
	var req deleteMeterRealtimeDataReq
	if err := c.ShouldBindJSON(&req); err != nil {
		// 2) ถ้าไม่ใช่ JSON body ให้ลองอ่านจาก query ids=1,2,3
		idsParam := strings.TrimSpace(c.Query("ids"))
		if idsParam == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Please provide ids",
				"hint":  `Send JSON {"ids":[1,2,3]} or query ?ids=1,2,3`,
			})
			return
		}

		parts := strings.Split(idsParam, ",")
		ids := make([]uint, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			n, convErr := strconv.ParseUint(p, 10, 64)
			if convErr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id in query", "value": p})
				return
			}
			ids = append(ids, uint(n))
		}

		if len(ids) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No valid ids"})
			return
		}
		req.IDs = ids
	}

	// optional hard delete
	force := strings.TrimSpace(strings.ToLower(c.Query("force"))) == "true"

	q := db.Model(&entity.MeterRealtimeData{}).Where("id IN ?", req.IDs)
	if force {
		q = q.Unscoped()
	}

	res := q.Delete(&entity.MeterRealtimeData{})
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Delete failed", "details": res.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "Deleted",
		"ids":            req.IDs,
		"deleted_rows":   res.RowsAffected,
		"hard_delete":    force,
		"soft_delete":    !force,
		"deleted_at_gorm": "If soft_delete=true, rows are marked deleted (gorm DeletedAt).",
	})
}


// =========================================================

// ============================================================================
// ✅ LOG SWITCH (ปิด log เพื่อไม่ให้หนัก server)
// - default: ปิด (0)
// - เปิดได้ด้วย env: METER_LOG=1 / true / on
// ============================================================================
var meterLogEnabled uint32 = 1

func init() {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("METER_LOG")))
	if v == "1" || v == "true" || v == "on" || v == "yes" {
		atomic.StoreUint32(&meterLogEnabled, 1)
	}
}

func isMeterLogEnabled() bool {
	return atomic.LoadUint32(&meterLogEnabled) == 1
}

func meterLogln(args ...interface{}) {
	if !isMeterLogEnabled() {
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
// key = deviceID (เช่น "meter_001"), value = set ของ connection
var (
	meterClients   = make(map[string]map[*websocket.Conn]bool)
	meterClientsMu sync.Mutex
)

// รองรับค่าตัวเลขที่มาได้ทั้ง float64 / int / string
func toFloat64(v interface{}) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint:
		return float64(x), true
	case uint64:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	case string:
		x = strings.TrimSpace(x)
		if x == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(x, 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func getMap(m map[string]interface{}, key string) (interface{}, bool) {
	v, ok := m[key]
	return v, ok
}

// ============================================================================
// 🔹 FRONTEND — สำหรับเว็บ Dashboard (เลือก device ที่จะดู)
//    ws://host/meter/frontend?deviceID=meter_001
// ============================================================================
func HandleFrontend(c *gin.Context) {
	deviceID := strings.TrimSpace(c.Query("deviceID"))
	if deviceID == "" {
		c.Status(http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// ผูก conn กับ deviceID
	meterClientsMu.Lock()
	if meterClients[deviceID] == nil {
		meterClients[deviceID] = make(map[*websocket.Conn]bool)
	}
	meterClients[deviceID][conn] = true
	meterClientsMu.Unlock()

	meterLogln("🌐 Frontend connected to Meter stream for device:", deviceID)

	// รอจน frontend ปิดเอง
	for {
		if _, _, err := conn.NextReader(); err != nil {
			meterClientsMu.Lock()
			delete(meterClients[deviceID], conn)
			if len(meterClients[deviceID]) == 0 {
				delete(meterClients, deviceID)
			}
			meterClientsMu.Unlock()

			meterLogln("❌ Frontend disconnected from Meter stream for device:", deviceID)
			break
		}
	}
}

// ============================================================================
// 🔹 HARDWARE / METER DEVICE — สำหรับอุปกรณ์ที่ส่งข้อมูลเข้ามา
//    ws://host/meter/meter_001
//
// ✅ ทำงานคล้าย solar:
// - รับ msg JSON
// - ใส่ device_id ให้
// - (optional) บันทึกลง DB ตาราง MeterRealtimeData
// - broadcast เฉพาะ frontend ที่ subscribe deviceID นี้
// ============================================================================
func HandleMeter(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	deviceID := strings.TrimSpace(c.Param("deviceID"))
	if deviceID == "" {
		// ไม่ควรเกิด แต่กันไว้
		return
	}

	meterLogln("⚡ Meter device connected:", deviceID)

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			meterLogln("⚠️  Meter device disconnected:", deviceID)
			break
		}

		// ตอบกลับ hardware ว่าเราโอเค
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ready"))

		// parse JSON
		var jsonData map[string]interface{}
		if err := json.Unmarshal(msg, &jsonData); err != nil {
			meterLogln("❌ Invalid JSON from meter:", err)
			continue
		}

		// ฝัง device_id
		jsonData["device_id"] = deviceID

		// --------------------------------------------------------------------
		// ✅ Extract ค่า meter จาก payload แบบยืดหยุ่น
		// รองรับ 2 แบบ:
		// 1) flat: {"timestamp":"...","w":...,"var":...,"va":...,"vrms":...,"irms":...}
		// 2) nested: {"timestamp":"...","data":{"w":...,"var":...,"va":...,"vrms":...,"irms":...}}
		// --------------------------------------------------------------------

		// timestamp
		var ts time.Time
		if v, ok := getMap(jsonData, "timestamp"); ok {
			if s, ok2 := v.(string); ok2 {
				if t, err := parseTimestampFlexible(s); err == nil {
					ts = t
				}
			}
		}
		if ts.IsZero() {
			// ถ้าไม่มี timestamp ให้ใช้เวลาปัจจุบัน
			ts = time.Now()
			jsonData["timestamp"] = ts.Format(time.RFC3339Nano)
		}

		// data map
		var dataMap map[string]interface{}
		if v, ok := getMap(jsonData, "data"); ok {
			if m, ok2 := v.(map[string]interface{}); ok2 {
				dataMap = m
			}
		}

		// helper ดึงค่าจาก dataMap ก่อน ถ้าไม่มีค่อยดึงจาก root
		readNumber := func(key string) float64 {
			if dataMap != nil {
				if v, ok := dataMap[key]; ok {
					if f, ok2 := toFloat64(v); ok2 {
						return f
					}
				}
			}
			if v, ok := jsonData[key]; ok {
				if f, ok2 := toFloat64(v); ok2 {
					return f
				}
			}
			return 0
		}

		w := readNumber("w")
		varVal := readNumber("var")
		va := readNumber("va")
		vrms := readNumber("vrms")
		irms := readNumber("irms")

		// เพิ่มให้ frontend เห็นเป็น flat ก็ได้ (กัน UI ง่าย)
		jsonData["w"] = w
		jsonData["var"] = varVal
		jsonData["va"] = va
		jsonData["vrms"] = vrms
		jsonData["irms"] = irms

		// --------------------------------------------------------------------
		// ✅ Save DB (MeterRealtimeData)
		// --------------------------------------------------------------------
		row := entity.MeterRealtimeData{
			DeviceID:  deviceID,
			Timestamp: ts,
			W:         w,
			Var:       varVal,
			VA:        va,
			Vrms:      vrms,
			Irms:      irms,
		}
		if err := config.DB().Create(&row).Error; err != nil {
			// ไม่ทำให้ WS ล่ม แค่ log เมื่อเปิด METER_LOG
			meterLogln("❌ DB create MeterRealtimeData failed:", err)
		}

		// marshal enriched แล้ว broadcast
		enriched, err := json.Marshal(jsonData)
		if err != nil {
			meterLogln("❌ Cannot marshal enriched meter data:", err)
			continue
		}

		broadcastToFrontend(deviceID, enriched)
	}
}

// ============================================================================
// 🔸 Broadcast ข้อมูลไปยัง frontend ที่ดู deviceID ตรงกันเท่านั้น
// ============================================================================
func broadcastToFrontend(deviceID string, msg []byte) {
	meterClientsMu.Lock()
	defer meterClientsMu.Unlock()

	clients, ok := meterClients[deviceID]
	if !ok {
		return
	}

	for client := range clients {
		if err := client.WriteMessage(websocket.TextMessage, msg); err != nil {
			client.Close()
			delete(clients, client)
		}
	}

	if len(clients) == 0 {
		delete(meterClients, deviceID)
	}
}
