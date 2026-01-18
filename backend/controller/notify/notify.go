package notify

import (
	"fmt"
	"net/smtp"
	"time"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ✅ ฟังก์ชันส่งอีเมลแจ้งเตือน
func SendBookingReminder(c *gin.Context) {
	db := config.DB()

	var sender entity.SendEmail
	if err := db.First(&sender).Error; err != nil {
		if c != nil {
			c.JSON(500, gin.H{"error": "ไม่พบข้อมูล Email สำหรับส่งแจ้งเตือน"})
		} else {
			fmt.Println("❌ ไม่พบข้อมูล Email สำหรับส่งแจ้งเตือน")
		}
		return
	}

	today := time.Now().Format("2006-01-02")
	var bookings []entity.Booking
	if err := db.Preload("User").Preload("EVCabinet").
		Where("DATE(start_date) = ? AND is_email_sent = ?", today, false).
		Find(&bookings).Error; err != nil {
		if c != nil {
			c.JSON(500, gin.H{"error": err.Error()})
		} else {
			fmt.Println("❌ Database error:", err)
		}
		return
	}

	if len(bookings) == 0 {
		if c != nil {
			c.JSON(200, gin.H{"message": "ไม่มีการจองในวันนี้"})
		} else {
			fmt.Println("ℹ️ ไม่มีการจองในวันนี้")
		}
		return
	}

	for _, b := range bookings {
		if b.User.Email == "" {
			continue
		}

		subject := "แจ้งเตือน: วันนี้คุณมีการจอง EV Station"
		body := fmt.Sprintf(`เรียนคุณ %s,

วันนี้ (%s) คือวันที่คุณได้จอง EV Station ไว้
สถานที่: %s
เวลาเริ่ม: %s
เวลาสิ้นสุด: %s

ขอบคุณที่ใช้บริการ EV Station.`,
			b.User.FirstName,
			today,
			b.EVCabinet.Name,
			b.StartDate.Format("15:04"),
			b.EndDate.Format("15:04"),
		)

		err := sendEmailWithAppPassword(sender.Email, sender.PassApp, b.User.Email, subject, body)
		if err == nil {
			db.Model(&b).Update("is_email_sent", true)
			fmt.Printf("✅ ส่งอีเมลถึง %s สำเร็จ → IsEmailSent = true\n", b.User.Email)
		} else {
			fmt.Printf("❌ ส่งอีเมลถึง %s ไม่สำเร็จ: %v\n", b.User.Email, err)
		}
	}

	if c != nil {
		c.JSON(200, gin.H{"message": "✅ ส่งอีเมลแจ้งเตือนสำเร็จ"})
	} else {
		fmt.Println("✅ ส่งอีเมลแจ้งเตือนสำเร็จ (จาก Cron Job)")
	}
}

// ✅ ฟังก์ชันส่งอีเมลด้วย Gmail App Password
func sendEmailWithAppPassword(from, appPassword, to, subject, body string) error {
	auth := smtp.PlainAuth("", from, appPassword, "smtp.gmail.com")
	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: %s\r\n\r\n%s", to, subject, body))
	return smtp.SendMail("smtp.gmail.com:587", auth, from, []string{to}, msg)
}

// ✅ ลบข้อมูล SolarRealtimeData + MeterRealtimeData ทุกๆ 3 เดือน (Hard Delete จริง)
// - ใช้ Unscoped() = ลบจริง ไม่ใช่ soft delete
// - ใช้ Transaction เพื่อความปลอดภัย
func PurgeSolarAndMeterRealtimeData(c *gin.Context) {
	db := config.DB()

	var deletedSolar int64
	var deletedMeter int64

	err := db.Transaction(func(tx *gorm.DB) error {
		// ✅ 1) ลบ SolarRealtimeData ทั้งหมด (Hard Delete)
		resSolar := tx.
			Session(&gorm.Session{AllowGlobalUpdate: true}).
			Unscoped().
			Delete(&entity.SolarRealtimeData{})
		if resSolar.Error != nil {
			return resSolar.Error
		}
		deletedSolar = resSolar.RowsAffected

		// ✅ 2) ลบ MeterRealtimeData ทั้งหมด (Hard Delete)
		resMeter := tx.
			Session(&gorm.Session{AllowGlobalUpdate: true}).
			Unscoped().
			Delete(&entity.MeterRealtimeData{})
		if resMeter.Error != nil {
			return resMeter.Error
		}
		deletedMeter = resMeter.RowsAffected

		return nil
	})

	if err != nil {
		if c != nil {
			c.JSON(500, gin.H{
				"error":  "ไม่สามารถลบข้อมูล RealtimeData ได้",
				"detail": err.Error(),
			})
		} else {
			fmt.Printf("❌ Purge realtime data failed: %v\n", err)
		}
		return
	}

	// ✅ Success
	resp := gin.H{
		"message":        "✅ ลบข้อมูล SolarRealtimeData + MeterRealtimeData สำเร็จ (Hard Delete)",
		"deleted_solar":  deletedSolar,
		"deleted_meter":  deletedMeter,
		"total_deleted":  deletedSolar + deletedMeter,
		"delete_mode":    "HARD_DELETE_UNSCOPED",
		"schedule_note":  "runs every 3 months",
	}

	if c != nil {
		c.JSON(200, resp)
	} else {
		fmt.Printf("✅ Purge Success (Cron): deleted_solar=%d deleted_meter=%d total=%d\n",
			deletedSolar, deletedMeter, deletedSolar+deletedMeter)
	}
}