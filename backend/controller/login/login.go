package login

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/Tawunchai/work-project/services"
)

// ✅ LOGIN: เก็บ token ใน HttpOnly Cookie สำหรับ Render + Vercel (Cross-site)
func AddLogin(c *gin.Context) {
	var loginData entity.User
	if err := c.ShouldBindJSON(&loginData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
		return
	}

	db := config.DB()
	var user entity.User
	if err := db.Preload("UserRole").Where("username = ?", loginData.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	if !config.CheckPasswordHash([]byte(loginData.Password), []byte(user.Password)) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	jwtWrapper := services.JwtWrapper{
		SecretKey:       "RhE9Q6zyV8Ai5jnPq2ZDsXMmLuy5eNkw",
		Issuer:          "EVStationAuth",
		ExpirationHours: 24,
	}

	token, err := jwtWrapper.GenerateToken(user.Username, user.ID, user.UserRole.RoleName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "error signing token"})
		return
	}

	// ✅ ตั้งค่า cookie สำหรับ cross-site (Render ↔️ Vercel)
	c.SetSameSite(http.SameSiteNoneMode)
	c.SetCookie(
		"access_token",
		token,
		86400, // อายุ 1 วัน
		"/",
		"evstation-sut.it.com", // ✅ ใช้ domain ของ backend https://evstation-sut.it.com/
		true,  // Secure (HTTPS เท่านั้น)
		true,  // HttpOnly
	)

	c.JSON(http.StatusOK, gin.H{"message": "login success"})
}

// ✅ LOGOUT: ล้าง cookie
func Logout(c *gin.Context) {
	c.SetSameSite(http.SameSiteNoneMode)
	c.SetCookie(
		"access_token",
		"",
		-1,
		"/",
		"evstation-sut.it.com", // ต้องตรงกับ domain ตอน login
		true,
		true,
	)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// ✅ GET PROFILE (อ่านข้อมูลผู้ใช้)
func GetProfile(c *gin.Context) {
	token, err := c.Cookie("access_token")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	jwtWrapper := services.JwtWrapper{SecretKey: "RhE9Q6zyV8Ai5jnPq2ZDsXMmLuy5eNkw"}
	claims, err := jwtWrapper.ValidateToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	db := config.DB()
	var user entity.User
	if err := db.Preload("UserRole").Preload("Employees").First(&user, claims.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var employeeID *uint
	if len(user.Employees) > 0 {
		employeeID = &user.Employees[0].ID
	}

	c.JSON(http.StatusOK, gin.H{
		"id":          user.ID,
		"username":    user.Username,
		"firstname":   user.FirstName,
		"lastname":    user.LastName,
		"role":        user.UserRole.RoleName,
		"email":       user.Email,
		"profile":     user.Profile,
		"employee_id": employeeID,
	})
}