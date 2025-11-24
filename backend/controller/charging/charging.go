package charging

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func ListEVData(c *gin.Context) {
    var evs []entity.EVcharging
    db := config.DB()

    result := db.
        Preload("Employee").
        Preload("Employee.User").
        Preload("Status").
        Preload("Type").
		Preload("EnergySource").
        Preload("Cabinets"). // ⭐ โหลด cabinets (many-to-many)
        Find(&evs)

    if result.Error != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
        return
    }

    c.JSON(http.StatusOK, evs)
}

func UpdateEVByID(c *gin.Context) {
	id := c.Param("id")
	var ev entity.EVcharging
	db := config.DB()

	// ตรวจว่า EV มีจริงไหม
	if err := db.Preload("Cabinets").First(&ev, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูล EV Charging"})
		return
	}

	// อัปโหลดรูปภาพใหม่
	file, err := c.FormFile("picture")
	if err == nil && file != nil {
		uploadDir := "uploads/evcharging"
		_ = os.MkdirAll(uploadDir, os.ModePerm)

		ext := filepath.Ext(file.Filename)
		newName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		filePath := filepath.Join(uploadDir, newName)

		if err := c.SaveUploadedFile(file, filePath); err == nil {
			ev.Picture = filePath
		}
	}

	// -------- อัปเดตฟิลด์ปกติ --------
	if v := c.PostForm("name"); v != "" {
		ev.Name = v
	}
	if v := c.PostForm("description"); v != "" {
		ev.Description = v
	}
	if v := c.PostForm("price"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			ev.Price = f
		}
	}
	if v := c.PostForm("statusID"); v != "" {
		p, _ := strconv.ParseUint(v, 10, 64)
		ev.StatusID = uint(p)
	}
	if v := c.PostForm("typeID"); v != "" {
		p, _ := strconv.ParseUint(v, 10, 64)
		ev.TypeID = uint(p)
	}

	// ⭐ ใหม่: อัปเดต EnergySourceID (Solar / Grid)
	if v := c.PostForm("energySourceID"); v != "" {
		if p, err := strconv.ParseUint(v, 10, 64); err == nil {
			ev.EnergySourceID = uint(p)
		}
	}

	if v := c.PostForm("employeeID"); v != "" {
		p, _ := strconv.ParseUint(v, 10, 64)
		tmp := uint(p)
		ev.EmployeeID = &tmp
	}

	// -------- อัปเดต Cabinets (Many-to-Many) --------
	cabinetIDsStr := c.PostForm("cabinetIDs") // เช่น "1,2,3"

	if cabinetIDsStr != "" {
		var newCabinets []entity.EVCabinet
		idStrings := strings.Split(cabinetIDsStr, ",")

		for _, s := range idStrings {
			if id, err := strconv.ParseUint(strings.TrimSpace(s), 10, 64); err == nil {
				newCabinets = append(newCabinets, entity.EVCabinet{
					Model: gorm.Model{ID: uint(id)},
				})
			}
		}

		// ⭐ แทนที่ตู้ทั้งหมด (Replace)
		db.Model(&ev).Association("Cabinets").Replace(newCabinets)
	}

	// ⭐ Save
	if err := db.Save(&ev).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตข้อมูลไม่สำเร็จ"})
		return
	}

	// โหลดข้อมูลกลับ (พร้อม EnergySource)
	db.Preload("Employee.User").
		Preload("Status").
		Preload("Type").
		Preload("EnergySource"). // ⭐ preload แหล่งพลังงาน
		Preload("Cabinets").
		First(&ev, id)

	c.JSON(http.StatusOK, gin.H{
		"message": "อัปเดตข้อมูล EV สำเร็จ",
		"data":    ev,
	})
}


func CreateEV(c *gin.Context) {
	file, err := c.FormFile("picture")
	var filePath string

	// อัปโหลดภาพ
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

		uploadDir := "uploads/evcharging"
		_ = os.MkdirAll(uploadDir, os.ModePerm)

		ext := filepath.Ext(file.Filename)
		newFileName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		filePath = filepath.Join(uploadDir, newFileName)

		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกรูปภาพไม่สำเร็จ"})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาอัปโหลดรูปภาพ"})
		return
	}

	// ---------------- รับข้อมูลจากฟอร์ม ----------------
	name := c.PostForm("name")
	description := c.PostForm("description")
	price, _ := strconv.ParseFloat(c.PostForm("price"), 64)
	statusID, _ := strconv.ParseUint(c.PostForm("statusID"), 10, 64)
	typeID, _ := strconv.ParseUint(c.PostForm("typeID"), 10, 64)

	// ⭐ รับ EnergySourceID (Solar / Grid)
	energySourceIDStr := c.PostForm("energySourceID")
	energySourceID, errES := strconv.ParseUint(energySourceIDStr, 10, 64)
	if energySourceIDStr == "" || errES != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาเลือกแหล่งพลังงาน (Energy Source)"})
		return
	}

	// Employee (อาจว่างได้)
	var employeeID *uint
	if empStr := c.PostForm("employeeID"); empStr != "" {
		p, _ := strconv.ParseUint(empStr, 10, 64)
		tmp := uint(p)
		employeeID = &tmp
	}

	// ⭐ รับ Cabinet IDs แบบ "1,2,3"
	cabinetIDsStr := c.PostForm("cabinetIDs") // "1,2,3"
	var cabinets []entity.EVCabinet

	if cabinetIDsStr != "" {
		idStrings := strings.Split(cabinetIDsStr, ",")
		for _, idStr := range idStrings {
			id, err := strconv.ParseUint(strings.TrimSpace(idStr), 10, 64)
			if err == nil {
				cabinets = append(cabinets, entity.EVCabinet{
					Model: gorm.Model{ID: uint(id)},
				})
			}
		}
	}

	// ---------------- สร้าง EVcharging ----------------
	ev := entity.EVcharging{
		Name:           name,
		Description:    description,
		Price:          price,
		Picture:        filePath,
		EmployeeID:     employeeID,
		StatusID:       uint(statusID),
		TypeID:         uint(typeID),
		EnergySourceID: uint(energySourceID), // ⭐ ผูก EnergySourceID
	}

	db := config.DB()

	if err := db.Create(&ev).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้าง EV ไม่สำเร็จ"})
		return
	}

	// ⭐ ผูก Many-to-Many กับ Cabinets
	if len(cabinets) > 0 {
		if err := db.Model(&ev).Association("Cabinets").Append(cabinets); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ผูกตู้ชาร์จไม่สำเร็จ"})
			return
		}
	}

	// โหลดกลับพร้อม relation
	db.Preload("Employee.User").
		Preload("Status").
		Preload("Type").
		Preload("EnergySource"). // ⭐ โหลด EnergySource กลับไปให้ frontend ใช้
		Preload("Cabinets").
		First(&ev, ev.ID)

	c.JSON(http.StatusCreated, gin.H{
		"message": "สร้างข้อมูล EV สำเร็จ",
		"data":    ev,
	})
}


func DeleteEVByID(c *gin.Context) {
	id := c.Param("id")

	db := config.DB()
	var ev entity.EVcharging
	if err := db.First(&ev, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "EVcharging not found"})
		return
	}

	if err := db.Delete(&ev).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "EVcharging deleted successfully"})
}

// GET /evcharging-payments
func ListEVChargingPayments(c *gin.Context) {
	var payments []entity.EVChargingPayment

	db := config.DB()
	result := db.
		Preload("EVcharging").
		Preload("Payment").
		Find(&payments)

	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, payments)
}
