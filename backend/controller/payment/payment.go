package payment

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func ListEVChargingPayment(c *gin.Context) {
	var payments []entity.EVChargingPayment

	db := config.DB()
	result := db.Preload("EVcharging").Preload("Payment").Find(&payments)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, payments)
}

func ListBank(c *gin.Context) {
	var banks []entity.Bank

	db := config.DB()
	result := db.Find(&banks)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, banks)
}

func UpdateBank(c *gin.Context) {
	var bank entity.Bank
	id := c.Param("id")

	db := config.DB()
	if err := db.First(&bank, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลธนาคาร"})
		return
	}

	// เพิ่ม Minimum ใน struct input
	var input struct {
		PromptPay string `json:"promptpay"`
		Manager   string `json:"manager"`
		Banking   string `json:"banking"`
		Minimum   uint   `json:"minimum"`  // <-- เพิ่ม Minimum
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bank.PromptPay = input.PromptPay
	bank.Manager = input.Manager
	bank.Banking = input.Banking
	bank.Minimum = input.Minimum    // <-- กำหนด Minimum

	if err := db.Save(&bank).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตข้อมูลไม่สำเร็จ"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": bank})
}

func ListPayment(c *gin.Context) {
	var payments []entity.Payment

	db := config.DB()
	result := db.Preload("User").Preload("Method").Find(&payments)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, payments)
}

// ใช้ struct นี้เป็น response ออกไปให้ frontend
type PaymentWithEVCharging struct {
	Payment            entity.Payment              `json:"payment"`
	EVChargingPayments []entity.EVChargingPayment  `json:"ev_charging_payments"`
}

// GET /payments/user/:user_id
func ListPaymentByUserID(c *gin.Context) {
	// 1) รับ user_id จาก path
	userIDParam := c.Param("user_id")
	userID, err := strconv.ParseUint(userIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
		return
	}

	db := config.DB()

	// 2) ดึง Payment ทั้งหมดของ user พร้อม User, Method
	var payments []entity.Payment
	if err := db.
		Preload("User").
		Preload("Method").
		Where("user_id = ?", uint(userID)).
		Find(&payments).Error; err != nil {

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// ถ้าไม่พบ payment เลย
	if len(payments) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"message": "no payments found for this user"})
		return
	}

	// 3) รวบรวม payment_id ทั้งหมดไว้ไป query EVChargingPayment ทีเดียว (กัน N+1 query)
	paymentIDs := make([]uint, 0, len(payments))
	for _, p := range payments {
		paymentIDs = append(paymentIDs, p.ID)
	}

	// 4) ดึง EVChargingPayment ทั้งหมดที่ผูกกับ payment_id ชุดนี้
	//    และ Preload EVcharging มาด้วยตามที่ต้องการ
	var evChargingPayments []entity.EVChargingPayment
	if err := db.
		Preload("EVcharging").
		Where("payment_id IN ?", paymentIDs).
		Find(&evChargingPayments).Error; err != nil {

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 5) ทำ map[PaymentID] → []EVChargingPayment เพื่อประกบใส่แต่ละ payment
	evMap := make(map[uint][]entity.EVChargingPayment)
	for _, evPay := range evChargingPayments {
		evMap[evPay.PaymentID] = append(evMap[evPay.PaymentID], evPay)
	}

	// 6) รวมข้อมูลเป็น slice ของ PaymentWithEVCharging ส่งออกไป
	response := make([]PaymentWithEVCharging, 0, len(payments))
	for _, p := range payments {
		item := PaymentWithEVCharging{
			Payment:            p,
			EVChargingPayments: evMap[p.ID], // ถ้าไม่มีจะเป็น nil/[] ว่าง ๆ
		}
		response = append(response, item)
	}

	// 7) ส่ง JSON ออกไป
	c.JSON(http.StatusOK, gin.H{
		"data": response,
	})
}

// GET /payments/:payment_id
func GetPaymentByPaymentID(c *gin.Context) {
	// 1) รับ payment_id จาก path
	paymentIDParam := c.Param("payment_id")
	paymentIDUint64, err := strconv.ParseUint(paymentIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payment_id"})
		return
	}
	paymentID := uint(paymentIDUint64)

	db := config.DB()

	// 2) ดึง Payment ตัวเดียวตาม ID พร้อม Preload ความสัมพันธ์ที่ต้องใช้
	var payment entity.Payment
	if err := db.
		Preload("User").
		Preload("Method").
		Preload("ChargingSessions").
		First(&payment, paymentID).Error; err != nil {

		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"message": "payment not found"})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 3) ดึง EVChargingPayment ทั้งหมดที่ผูกกับ payment นี้
	var evChargingPayments []entity.EVChargingPayment
	if err := db.
		Preload("EVcharging").
		Where("payment_id = ?", payment.ID).
		Find(&evChargingPayments).Error; err != nil {

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 4) ประกอบเป็น PaymentWithEVCharging แล้วส่งออก
	response := PaymentWithEVCharging{
		Payment:            payment,
		EVChargingPayments: evChargingPayments,
	}

	c.JSON(http.StatusOK, gin.H{
		"data": response,
	})
}

func CreatePayment(c *gin.Context) {
	var filePath string

	// ==========================
	// 📌 ตรวจสอบรูปภาพ ถ้ามี
	// ==========================
	file, err := c.FormFile("picture")
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
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปภาพต้องเป็นไฟล์ .jpg, .png, .gif เท่านั้น"})
			return
		}

		uploadDir := "uploads/payment"
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์เก็บไฟล์ได้"})
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
		filePath = ""
	}

	// ==========================
	// 📌 รับข้อมูลจาก Form
	// ==========================
	dateStr := c.PostForm("date")
	amountStr := c.PostForm("amount")
	userIDStr := c.PostForm("user_id")
	methodIDStr := c.PostForm("method_id")
	referenceNumber := c.PostForm("reference_number")
	cabinetIDStr := c.PostForm("ev_cabinet_id") // ⭐⭐ เพิ่มมาใหม่

	// ==========================
	// 📌 แปลงข้อมูล
	// ==========================
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง ต้องเป็น YYYY-MM-DD"})
		return
	}

	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "จำนวนเงินไม่ถูกต้อง"})
		return
	}

	userID64, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID ไม่ถูกต้อง"})
		return
	}
	userID := uint(userID64)

	methodID64, err := strconv.ParseUint(methodIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Method ID ไม่ถูกต้อง"})
		return
	}
	methodID := uint(methodID64)

	// ⭐⭐ ใหม่ — cabinet_id
	var cabinetID *uint = nil
	if cabinetIDStr != "" {
		cID, err := strconv.ParseUint(cabinetIDStr, 10, 32)
		if err == nil {
			tmp := uint(cID)
			cabinetID = &tmp
		}
	}

	// ==========================
	// 📌 Create Payment
	// ==========================
	payment := entity.Payment{
		Date:            date,
		Amount:          amount,
		UserID:          &userID,
		MethodID:        &methodID,
		EVCabinetID:     cabinetID, // ⭐⭐ บันทึกตู้ชาร์จ
		ReferenceNumber: referenceNumber,
		Picture:         filePath,
	}

	if err := config.DB().Create(&payment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกข้อมูลได้: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "สร้างข้อมูล Payment สำเร็จ",
		"data":    payment,
	})
}

// ✅ Struct สำหรับรับ JSON จาก frontend
type CreateEVChargingPaymentInput struct {
	EVchargingID uint    `json:"evcharging_id" binding:"required"`
	PaymentID    uint    `json:"payment_id" binding:"required"`
	Price        float64 `json:"price"`
	Percent      float64 `json:"percent"` // เปลี่ยนจาก Quantity เป็น Percent
	Power        float64 `json:"power"`   // เพิ่ม Power
}

// ✅ Controller สำหรับสร้างข้อมูล EVChargingPayment
func CreateEVChargingPayment(c *gin.Context) {
	var input CreateEVChargingPaymentInput

	// ตรวจสอบความถูกต้องของ JSON input
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "ข้อมูลไม่ครบหรือไม่ถูกต้อง: " + err.Error(),
		})
		return
	}

	db := config.DB()

	// ✅ สร้างข้อมูลใหม่ตาม struct entity.EVChargingPayment
	evPayment := entity.EVChargingPayment{
		EVchargingID: input.EVchargingID,
		PaymentID:    input.PaymentID,
		Price:        input.Price,
		Percent:      input.Percent, // ✅ ใช้ Percent แทน Quantity
		Power:        input.Power,   // ✅ เพิ่ม Power
		RemainingPower: 0,
	}

	// ✅ บันทึกลงฐานข้อมูล
	if err := db.Create(&evPayment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "ไม่สามารถบันทึกข้อมูลได้: " + err.Error(),
		})
		return
	}

	// ✅ ตอบกลับข้อมูลที่สร้างสำเร็จ
	c.JSON(http.StatusOK, evPayment)
}

func ListPaymentCoins(c *gin.Context) {
	var paymentCoins []entity.PaymentCoin

	db := config.DB()
	result := db.Preload("User").Find(&paymentCoins)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, paymentCoins)
}

// GET /payment-coins/:user_id
func ListPaymentCoinsByUserID(c *gin.Context) {
	userIDParam := c.Param("user_id")
	userID, err := strconv.ParseUint(userIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var paymentCoins []entity.PaymentCoin
	db := config.DB()
	result := db.
		Preload("User").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&paymentCoins)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if len(paymentCoins) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No payment records found", "data": []entity.PaymentCoin{}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": paymentCoins})
}

func CreatePaymentCoin(c *gin.Context) {
    var filePath string

    // 1. จัดการรูปภาพ
    file, err := c.FormFile("Picture")
    if err == nil && file != nil {
        // ตรวจสอบ type ไฟล์
        validTypes := []string{"image/jpeg", "image/png", "image/gif"}
        isValid := false
        for _, t := range validTypes {
            if file.Header.Get("Content-Type") == t {
                isValid = true
                break
            }
        }
        if !isValid {
            c.JSON(http.StatusBadRequest, gin.H{"error": "รูปภาพต้องเป็นไฟล์ .jpg, .png, .gif เท่านั้น"})
            return
        }

        uploadDir := "uploads/paymentcoin"
        if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์เก็บไฟล์ได้"})
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
        filePath = ""
    }

    // 2. รับข้อมูลอื่นจาก form
    dateStr := c.PostForm("Date")                    // ตัว D ใหญ่ตรงกับ key ที่ส่งมาจาก frontend
    amountStr := c.PostForm("Amount")
    referenceNumber := c.PostForm("ReferenceNumber")
    userIDStr := c.PostForm("UserID")

    // 3. แปลงค่าที่จำเป็น
    // กรณี Date ใน react เป็น ISO string ใช้ time.Parse(time.RFC3339, ...)
    var date time.Time
    if dateStr != "" {
        date, err = time.Parse(time.RFC3339, dateStr)
        if err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น ISO 8601)"})
            return
        }
    } else {
        date = time.Now()
    }

    amount, err := strconv.ParseFloat(amountStr, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "จำนวนเงินไม่ถูกต้อง"})
        return
    }

    userID64, err := strconv.ParseUint(userIDStr, 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "UserID ไม่ถูกต้อง"})
        return
    }
    userID := uint(userID64)

    // 4. ตรวจสอบ user
    db := config.DB()
    var user entity.User
    if err := db.First(&user, userID).Error; err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "User not found"})
        return
    }

    // 5. สร้างข้อมูล PaymentCoin
    paymentCoin := entity.PaymentCoin{
        Date:            date,
        Amount:          amount,
        ReferenceNumber: referenceNumber,
        Picture:         filePath, // string (อาจเป็น path ว่าง)
        UserID:          userID,
    }

    if err := db.Create(&paymentCoin).Error; err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    db.Preload("User").First(&paymentCoin, paymentCoin.ID)

    c.JSON(http.StatusCreated, paymentCoin)
}

// DELETE /payment-coins
func DeletePaymentCoins(c *gin.Context) {
	var ids []uint

	// อ่าน array ของ ID จาก body เช่น [1, 2, 3]
	if err := c.ShouldBindJSON(&ids); err != nil || len(ids) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาส่ง ID ของ PaymentCoin เป็น array เช่น [1,2,3]"})
		return
	}

	db := config.DB()
	var paymentCoins []entity.PaymentCoin

	// ดึงข้อมูลทั้งหมดที่ต้องลบ
	if err := db.Find(&paymentCoins, ids).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลได้"})
		return
	}

	// ลบรูปภาพทั้งหมด
	for _, paymentCoin := range paymentCoins {
		if paymentCoin.Picture != "" && filepath.HasPrefix(paymentCoin.Picture, "uploads/paymentcoin") {
			if _, err := os.Stat(paymentCoin.Picture); err == nil {
				if removeErr := os.Remove(paymentCoin.Picture); removeErr != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถลบรูปภาพได้: " + removeErr.Error()})
					return
				}
			}
		}
	}

	// ลบข้อมูลในฐานข้อมูลทั้งหมด
	if err := db.Delete(&entity.PaymentCoin{}, ids).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถลบข้อมูลได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ลบ PaymentCoin ทั้งหมดสำเร็จพร้อมลบรูปภาพ",
		"deleted": ids,
	})
}

// DELETE /payments
func DeletePayment(c *gin.Context) {
	var ids []uint

	// อ่าน array ของ ID จาก body เช่น [1, 2, 3]
	if err := c.ShouldBindJSON(&ids); err != nil || len(ids) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "กรุณาส่ง ID ของ Payment เป็น array เช่น [1,2,3]",
		})
		return
	}

	db := config.DB()
	var payments []entity.Payment

	// ดึงข้อมูลทั้งหมดที่ต้องลบ
	if err := db.Find(&payments, ids).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "ไม่สามารถดึงข้อมูลได้",
		})
		return
	}

	// ลบรูปภาพทั้งหมด (ถ้ามี)
	for _, payment := range payments {
		if payment.Picture != "" && filepath.HasPrefix(payment.Picture, "uploads/payment") {
			if _, err := os.Stat(payment.Picture); err == nil {
				if removeErr := os.Remove(payment.Picture); removeErr != nil {
					c.JSON(http.StatusInternalServerError, gin.H{
						"error": "ไม่สามารถลบรูปภาพได้: " + removeErr.Error(),
					})
					return
				}
			}
		}
	}

	// ลบข้อมูลในฐานข้อมูลทั้งหมด
	if err := db.Delete(&entity.Payment{}, ids).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "ไม่สามารถลบข้อมูลได้",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ลบ Payment ทั้งหมดสำเร็จพร้อมลบรูปภาพ",
		"deleted": ids,
	})
}

// ✅ GetDataPaymentByRef: ตรวจสอบว่ามี ref นี้ใน Payment หรือ PaymentCoin หรือไม่
func GetDataPaymentByRef(c *gin.Context) {
	ref := c.Param("ref")
	db := config.DB()

	// ค้นใน Payment ก่อน
	var payment entity.Payment
	if err := db.Where("reference_number = ?", ref).First(&payment).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{
			"found":   true,
			"type":    "Payment",
			"message": "พบข้อมูลใน Payment",
			"data":    payment,
		})
		return
	}

	// ถ้าไม่พบใน Payment ให้ค้นใน PaymentCoin
	var paymentCoin entity.PaymentCoin
	if err := db.Where("reference_number = ?", ref).First(&paymentCoin).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{
			"found":   true,
			"type":    "PaymentCoin",
			"message": "พบข้อมูลใน PaymentCoin",
			"data":    paymentCoin,
		})
		return
	}

	// ไม่พบข้อมูล
	c.JSON(http.StatusNotFound, gin.H{
		"found":   false,
		"ref":     ref,
		"message": "ไม่พบข้อมูลใน Payment หรือ PaymentCoin",
	})
}