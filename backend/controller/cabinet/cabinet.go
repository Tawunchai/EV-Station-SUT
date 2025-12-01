package cabinet

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
)

// GET /ev-cabinets
func ListCabinetEV(c *gin.Context) {
	db := config.DB()
	var cabinets []entity.EVCabinet

	// ✅ โหลดความสัมพันธ์ด้วย Preload เช่น Employee, EVcharging, Booking
	results := db.Preload("Employee.User").Preload("Hardware").Find(&cabinets)

	if results.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": results.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, cabinets)
}

// ✅ สร้างตู้ EV Cabinet ใหม่
func CreateEVCabinet(c *gin.Context) {
	file, err := c.FormFile("image")
	var filePath string

	if err == nil && file != nil {
		validTypes := []string{"image/jpeg", "image/png", "image/gif"}
		isValid := false
		for _, t := range validTypes {
			if file.Header.Get("Content-Type") == t {
				isValid = true
				break
			}
		}
		if !isValid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปภาพต้องเป็น .jpg, .png, หรือ .gif"})
			return
		}

		uploadDir := "uploads/evcabinet"
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์เก็บรูปได้"})
			return
		}

		ext := filepath.Ext(file.Filename)
		newFileName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		filePath = filepath.Join(uploadDir, newFileName)

		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาอัปโหลดรูปภาพ"})
		return
	}

	// -------- รับข้อมูลจาก Form --------
	name := c.PostForm("name")
	description := c.PostForm("description")
	location := c.PostForm("location")
	status := c.PostForm("status")
	latitudeStr := c.PostForm("latitude")
	longitudeStr := c.PostForm("longitude")
	employeeIDStr := c.PostForm("employeeID")

	// ⭐ ใหม่: UrlWebsocket และ ChargePoint
	urlWebsocket := c.PostForm("urlWebsocket") // เช่น wss://xxx/ocpp
	chargePoint := c.PostForm("chargePoint")   // เช่น CP_1, ESP32-01

	// ⭐ ใหม่: HardwareID
	hardwareIDStr := c.PostForm("hardwareID")

	latitude, _ := strconv.ParseFloat(latitudeStr, 64)
	longitude, _ := strconv.ParseFloat(longitudeStr, 64)

	var employeeID *uint = nil
	if employeeIDStr != "" {
		parsedID, err := strconv.ParseUint(employeeIDStr, 10, 32)
		if err == nil {
			temp := uint(parsedID)
			employeeID = &temp
		}
	}

	// แปลง HardwareID (ถ้าส่งมา)
	var hardwareID uint
	if hardwareIDStr != "" {
		parsedHardwareID, err := strconv.ParseUint(hardwareIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "HardwareID ไม่ถูกต้อง"})
			return
		}
		hardwareID = uint(parsedHardwareID)
	}

	ev := entity.EVCabinet{
		Name:         name,
		Description:  description,
		Location:     location,
		Status:       status,
		UrlWebsocket: urlWebsocket,
		ChargePoint:  chargePoint,
		Latitude:     latitude,
		Longitude:    longitude,
		Image:        filePath,
		EmployeeID:   employeeID,
		HardwareID:   hardwareID, // ⭐ ผูก Hardware ตอนสร้าง
	}

	if err := config.DB().Create(&ev).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "EVCabinet created successfully",
		"data":    ev,
	})
}

// ✅ อัปเดตข้อมูลตู้ EV Cabinet ตาม ID
func UpdateEVCabinetByID(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.Atoi(idParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid EVCabinet ID"})
		return
	}

	db := config.DB()
	var ev entity.EVCabinet
	if err := db.First(&ev, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "EVCabinet not found"})
		return
	}

	// -------- อัปโหลดรูปใหม่ (ถ้ามี) --------
	file, _ := c.FormFile("image")
	if file != nil {
		uploadDir := "uploads/evcabinet"
		_ = os.MkdirAll(uploadDir, os.ModePerm)
		ext := filepath.Ext(file.Filename)
		newFileName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		filePath := filepath.Join(uploadDir, newFileName)

		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// ลบไฟล์เก่าถ้ามี
		if ev.Image != "" {
			_ = os.Remove(ev.Image)
		}

		ev.Image = filePath
	}

	// -------- อัปเดตฟิลด์อื่น ๆ --------
	if v := c.PostForm("name"); v != "" {
		ev.Name = v
	}
	if v := c.PostForm("description"); v != "" {
		ev.Description = v
	}
	if v := c.PostForm("location"); v != "" {
		ev.Location = v
	}
	if v := c.PostForm("status"); v != "" {
		ev.Status = v
	}
	if v := c.PostForm("latitude"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			ev.Latitude = f
		}
	}
	if v := c.PostForm("longitude"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			ev.Longitude = f
		}
	}
	if v := c.PostForm("employeeID"); v != "" {
		if uid, err := strconv.ParseUint(v, 10, 32); err == nil {
			temp := uint(uid)
			ev.EmployeeID = &temp
		}
	}

	// ⭐ ใหม่: อัปเดต UrlWebsocket และ ChargePoint
	if v := c.PostForm("urlWebsocket"); v != "" {
		ev.UrlWebsocket = v
	}
	if v := c.PostForm("chargePoint"); v != "" {
		ev.ChargePoint = v
	}

	// ⭐ ใหม่: อัปเดต HardwareID
	if v := c.PostForm("hardwareID"); v != "" {
		hid, err := strconv.ParseUint(v, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "HardwareID ไม่ถูกต้อง"})
			return
		}
		ev.HardwareID = uint(hid)
	}

	if err := db.Save(&ev).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "EVCabinet updated successfully",
		"data":    ev,
	})
}

// ✅ ลบข้อมูล EVCabinet ตาม ID (ไม่ลบรูปในเครื่อง)
func DeleteEVCabinetByID(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.Atoi(idParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid EVCabinet ID"})
		return
	}

	db := config.DB()
	var ev entity.EVCabinet

	// ตรวจสอบว่ามีข้อมูลนี้ไหม
	if err := db.First(&ev, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "EVCabinet not found"})
		return
	}

	// ลบข้อมูลออกจากฐานข้อมูล
	if err := db.Delete(&ev).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถลบข้อมูลได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "EVCabinet deleted successfully"})
}


// GET /ev-cabinets/:id
func GetCabinetByID(c *gin.Context) {
	// ดึง param :id จาก URL
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสตู้ไม่ถูกต้อง"})
		return
	}

	db := config.DB()

	var cabinet entity.EVCabinet

	// ✅ Preload Hardware
	if err := db.Preload("Hardware").First(&cabinet, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบบันทึกตู้ชาร์จ"})
		return
	}

	c.JSON(http.StatusOK, cabinet)
}


// GET /charging-session/monitor/:charge_point
func GetDataMonitorByChargePoint(c *gin.Context) {

	chargePoint := c.Param("charge_point")
	if chargePoint == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "charge_point is required"})
		return
	}

	db := config.DB()

	var sessions []entity.ChargingSession

	// JOIN ตรงนี้สำคัญมาก ‼️ ใช้ชื่อ table = ev_cabinets ไม่ใช่ e_v_cabinets
	err := db.
		Model(&entity.ChargingSession{}).
		// join payment ก่อน
		Joins("LEFT JOIN payments ON payments.id = charging_sessions.payment_id").
		// join cabinet แบบถูกต้อง (ชื่อ table = ev_cabinets)
		Joins("LEFT JOIN ev_cabinets ON ev_cabinets.id = payments.ev_cabinet_id").
		// เงื่อนไข: session จบแล้ว และ match charge point
		Where("charging_sessions.status = ? AND ev_cabinets.charge_point = ?", true, chargePoint).
		// Preload ความสัมพันธ์ทั้งหมด
		Preload("Payment").
		Preload("Payment.EVCabinet").
		Preload("Payment.EVChargingPayments").
		Preload("Payment.EVChargingPayments.EVcharging").
		Preload("Payment.EVChargingPayments.EVcharging.EnergySource").
		// order ให้ล่าสุดขึ้นก่อน
		Order("charging_sessions.end_time DESC").
		Find(&sessions).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	if len(sessions) == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error":       "ไม่พบ ChargingSession ของตู้ชาร์จนี้ที่ status = false",
			"chargePoint": chargePoint,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"chargePoint": chargePoint,
		"count":       len(sessions),
		"data":        sessions,
	})
}