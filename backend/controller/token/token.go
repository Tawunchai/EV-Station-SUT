package tokening

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ✅ เมื่อจ่ายเงินสำเร็จ (Coin หรือ QR)
func PaymentSuccess(c *gin.Context) {
	var req struct {
		UserID    uint `json:"user_id"`
		PaymentID uint `json:"payment_id"`
	}

	// 🟦 ตรวจสอบข้อมูลที่ส่งมา
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request data"})
		return
	}
	if req.UserID == 0 || req.PaymentID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing user_id or payment_id"})
		return
	}

	// 🟦 ตรวจสอบว่ามี Payment จริงในระบบ
	var payment entity.Payment
	if err := config.DB().First(&payment, req.PaymentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "payment not found"})
		return
	}

	// 🟦 สร้าง token สำหรับ session การชาร์จ
	token := uuid.New().String()

	session := entity.ChargingSession{
		UserID:      req.UserID,
		Token:       token,
		ExpiresAt:   time.Now().Add(300 * time.Minute),
		Status:      true,
		StartEnergy: 0,
		PaymentID:   req.PaymentID,
		StartTime:   time.Time{},
		EndTime:     time.Time{},
	}

	// 🟦 บันทึกลงฐานข้อมูล
	if err := config.DB().Create(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create session"})
		return
	}

	// 🟦 ส่งกลับให้ frontend
	c.JSON(http.StatusOK, gin.H{
		"charging_token": token,
		"expires_at":     session.ExpiresAt,
		"user_id":        session.UserID,
		"payment_id":     session.PaymentID,
		"status":         session.Status,
	})
}

func VerifyChargingSession(c *gin.Context) {
	token := c.Query("token")
	var session entity.ChargingSession

	// 1) ตรวจว่า token มีจริงไหม
	if err := config.DB().Where("token = ?", token).First(&session).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid token"})
		return
	}

	// 2) ตรวจเฉพาะสถานะ session ต้องเป็น true เท่านั้น
	if !session.Status {
		c.JSON(http.StatusForbidden, gin.H{"error": "session not active"})
		return
	}

	// ✔ ผ่าน — token ใช้ได้ และอยู่ในสถานะ active
	c.JSON(http.StatusOK, gin.H{
		"ok":     true,
		"status": session.Status,
	})
}

// GET /charging-session/:user_id
func GetDataByUserID(c *gin.Context) {

	// 1) รับ user_id (string)
	userIDParam := c.Param("user_id")

	// แปลงเป็น uint
	userID, err := strconv.ParseUint(userIDParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
		return
	}

	// 2) Query DB - เฉพาะ status = true เท่านั้น
	var sessions []entity.ChargingSession
	db := config.DB()

	err = db.
		Where("user_id = ? AND status = ?", uint(userID), true).
		Preload("Payment").
		Preload("Payment.EVCabinet").
		Preload("Payment.EVChargingPayments").
		Preload("Payment.EVChargingPayments.EVcharging").
		Preload("Payment.EVChargingPayments.EVcharging.EnergySource").
		Find(&sessions).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 3) ส่งข้อมูลกลับ
	c.JSON(http.StatusOK, gin.H{
		"data": sessions,
	})
}

// ✅ อัปเดต Status = false และตั้ง EndTime = ตอนนี้
//    แต่ EndTime จะถูกอัปเดตเฉพาะ Session ที่ EndTime ยังว่างอยู่เท่านั้น
func UpdateStatusByPaymentID(c *gin.Context) {

	// 1) รับค่า payment_id จาก URL
	paymentIDStr := c.Param("payment_id")
	paymentID, err := strconv.ParseUint(paymentIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "PaymentID ไม่ถูกต้อง"})
		return
	}

	db := config.DB()

	// 2) หา ChargingSession ที่ PaymentID นี้
	var sessions []entity.ChargingSession
	if err := db.Where("payment_id = ?", uint(paymentID)).Find(&sessions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถค้นหา Session ได้"})
		return
	}

	if len(sessions) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบ ChargingSession ของ Payment นี้"})
		return
	}

	now := time.Now()
	updatedCount := 0

	// 3) loop ทีละ Session
	for _, s := range sessions {

		// สร้าง map สำหรับอัปเดตของตัวนี้
		updates := map[string]interface{}{
			"status": false, // ✅ อัปเดต Status ทุกตัวให้ false เสมอ
		}

		// ✅ ถ้า EndTime ยัง "ว่าง" อยู่เท่านั้น ค่อยตั้งค่า
		//    (กรณี field เป็น time.Time)
		if s.EndTime.IsZero() {
			updates["end_time"] = now
		}

		// ถ้า field EndTime เป็น *time.Time ให้ใช้แบบนี้แทน (comment ไว้เผื่อแก้ที่ struct)
		// if s.EndTime == nil || s.EndTime.IsZero() {
		//     updates["end_time"] = now
		// }

		if err := db.Model(&entity.ChargingSession{}).
			Where("id = ?", s.ID).
			Updates(updates).Error; err != nil {

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "อัปเดตสถานะหรือ EndTime ไม่สำเร็จ",
				"id":    s.ID,
			})
			return
		}

		updatedCount++
	}

	// 4) ส่ง Response กลับ
	c.JSON(http.StatusOK, gin.H{
		"message":         "อัปเดตสถานะสำเร็จ และอัปเดต EndTime เฉพาะ Session ที่ยังไม่มีค่า",
		"payment_id":      paymentID,
		"updated_records": updatedCount,
		"end_time":        now,
	})
}

// GET /charging-session/status/true
func GetChargingSessionByStatus(c *gin.Context) {
	var sessions []entity.ChargingSession

	db := config.DB()

	// Query เฉพาะ Status = true
	if err := db.
		Where("status = ?", true).
		Preload("Payment").
		Preload("Payment.EVCabinet"). // preload ต่อไปยัง Cabinet
		Find(&sessions).Error; err != nil {

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": sessions,
	})
}

// GET /charging-session/status/:user_id
func GetChargingSessionByStatusAndUserID(c *gin.Context) {

	// รับ user_id จาก param
	userIDParam := c.Param("user_id")
	userID, err := strconv.ParseUint(userIDParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
		return
	}

	var sessions []entity.ChargingSession
	db := config.DB()

	// Query: หาเฉพาะ Status = true และ UserID ที่ส่งมา
	if err := db.
		Where("status = ? AND user_id = ?", true, uint(userID)).
		Preload("Payment").
		Preload("Payment.EVCabinet").
		Find(&sessions).Error; err != nil {

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": sessions,
	})
}
