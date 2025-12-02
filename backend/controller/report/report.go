package report

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/gin-gonic/gin"
)

func ListReport(c *gin.Context) {
	var reports []entity.Report

	db := config.DB()
	result := db.Preload("Employee").Preload("User").Find(&reports)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, reports)
}

func CreateReport(c *gin.Context) {
	// อ่านไฟล์รูปภาพ (ไม่บังคับว่าต้องมี)
	file, err := c.FormFile("picture")
	var filePath string

	if err == nil && file != nil {
		// ตรวจสอบชนิดไฟล์
		validTypes := []string{"image/jpeg", "image/png", "image/gif"}
		isValid := false
		for _, t := range validTypes {
			if file.Header.Get("Content-Type") == t {
				isValid = true
				break
			}
		}
		if !isValid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปภาพต้องเป็น .jpg, .png หรือ .gif เท่านั้น"})
			return
		}

		// สร้างโฟลเดอร์ถ้ายังไม่มี
		uploadDir := "uploads/reports"
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์เก็บไฟล์ได้"})
			return
		}

		// ตั้งชื่อไฟล์ใหม่เพื่อป้องกันซ้ำ
		ext := filepath.Ext(file.Filename)
		newFileName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		filePath = filepath.Join(uploadDir, newFileName)

		// บันทึกไฟล์ลงเครื่อง
		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		// ถ้าไม่มีไฟล์แนบ ก็ให้ filePath เป็นค่าว่าง
		filePath = ""
	}

	// รับค่าจากฟอร์ม
	description := c.PostForm("description")
	userIDStr := c.PostForm("userID")

	// แปลง userID จาก string เป็น *uint
	var userID *uint = nil
	if userIDStr != "" {
		if parsedID, err := strconv.ParseUint(userIDStr, 10, 32); err == nil {
			temp := uint(parsedID)
			userID = &temp
		}
	}

	// EmployeeID ตั้งเป็น null เสมอ
	var employeeID *uint = nil

	report := entity.Report{
		Picture:     filePath,     // ค่าว่างได้ถ้าไม่แนบ
		Description: description,
		Status:      "Pending",
		UserID:      userID,
		EmployeeID:  employeeID,
	}

	if err := config.DB().Create(&report).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Report created successfully",
		"data":    report,
	})
}


func UpdateReport(c *gin.Context) {
	var report entity.Report
	id := c.Param("id")

	db := config.DB()
	if err := db.First(&report, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Report not found"})
		return
	}

	var input struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	report.Status = input.Status

	if err := db.Save(&report).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}

func DeleteReportByID(c *gin.Context) {
	id := c.Param("id")

	db := config.DB()
	var report entity.Report

	// ค้นหา Report ตาม id
	if err := db.First(&report, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Report not found"})
		return
	}

	// ลบ Report ที่เจอ
	if err := db.Delete(&report).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Report deleted successfully"})
}

// ✅ GET /report/user/:user_id
func GetReportByUserID(c *gin.Context) {

    // 1) รับ user_id จาก URL
    userIDParam := c.Param("id")
    userID, err := strconv.Atoi(userIDParam)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
        return
    }

    db := config.DB()

    // 2) ดึงข้อมูลทั้งหมดของ user นี้
    var reports []entity.Report
    if err := db.
        Where("user_id = ?", userID).
        Preload("User").
        Preload("Employee").
        Find(&reports).Error; err != nil {

        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    // 3) ถ้าไม่เจอเลย
    if len(reports) == 0 {
        c.JSON(http.StatusNotFound, gin.H{"error": "No reports found for this user"})
        return
    }

    // 4) ส่งข้อมูลกลับ
    c.JSON(http.StatusOK, gin.H{
        "data": reports,
    })
}