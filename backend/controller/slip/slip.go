package slip

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"

	"github.com/gin-gonic/gin"
)

const ThunderAuthToken = "c01f7f7b-5be6-4b43-838f-d03142e12390"

func CheckSlipThunder(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่พบไฟล์ในคำขอ"})
		return
	}

	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เปิดไฟล์ไม่ได้"})
		return
	}
	defer f.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", file.Filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้าง form file ไม่ได้"})
		return
	}

	_, err = io.Copy(part, f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เขียนไฟล์ลง form ไม่ได้"})
		return
	}

	err = writer.Close()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ปิด writer ไม่ได้"})
		return
	}

	req, err := http.NewRequest("POST", "https://api.thunder.in.th/v1/verify", body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้าง request ไม่ได้"})
		return
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+ThunderAuthToken)

	fmt.Println("Authorization header:", req.Header.Get("Authorization"))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ส่งคำขอไป Thunder API ไม่สำเร็จ"})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อ่าน response ไม่ได้"})
		return
	}

	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, gin.H{"error": "Thunder API error", "detail": string(respBody)})
		return
	}

	c.Data(http.StatusOK, "application/json", respBody)
}


type SlipRequest struct {
	Img string `json:"img"`
}

func CheckSlipOI(c *gin.Context) {
	var req SlipRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปภาพไม่ถูกต้อง"})
		return
	}

	// ❌ ไม่ใช้ amount แล้ว
	apiURL := "https://slip-c.oiioioiiioooioio.download/api/slip"
	// เตรียม JSON payload
	payload, err := json.Marshal(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "แปลงข้อมูลล้มเหลว"})
		return
	}

	// POST ไปยัง OIIO API
	resp, err := http.Post(apiURL, "application/json", bytes.NewBuffer(payload))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เชื่อมต่อกับระบบตรวจสลิปล้มเหลว"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อ่านข้อมูลตอบกลับล้มเหลว"})
		return
	}

	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, gin.H{"error": "ตรวจสอบสลิปล้มเหลว", "detail": string(body)})
		return
	}

	// สำเร็จ
	c.Data(http.StatusOK, "application/json", body)
}
