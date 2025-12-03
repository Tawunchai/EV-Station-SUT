package config

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Tawunchai/work-project/entity"
	"github.com/glebarez/sqlite" // ✅ pure Go driver (no CGO)
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)



var db *gorm.DB
func DB() *gorm.DB { return db }

// --------------------- Custom Logger ---------------------
type CustomLogger struct{}
func (l *CustomLogger) LogMode(level logger.LogLevel) logger.Interface            { return l }
func (l *CustomLogger) Info(ctx context.Context, msg string, args ...interface{}) {}
func (l *CustomLogger) Warn(ctx context.Context, msg string, args ...interface{}) {}
func (l *CustomLogger) Error(ctx context.Context, msg string, args ...interface{}) {
	if !strings.Contains(msg, "record not found") {
		log.Printf(msg, args...)
	}
}
func (l *CustomLogger) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {}

// --------------------- DSN helper ---------------------
// คืนทั้ง DSN และ "ไฟล์จริง" สำหรับเช็คว่ามีไฟล์อยู่ไหม
func resolveDSN() (dsn string, filePath string) {
	// ถ้ากำหนด DATA_DIR ให้เก็บ DB ในที่นั้น
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		// Render persistent disk ปกติ mount ที่ /var/data
		if st, err := os.Stat("/var/data"); err == nil && st.IsDir() {
			dataDir = "/var/data"
		}
	}
	if dataDir != "" {
		filePath = filepath.Join(dataDir, "work.db")
		// ใช้ WAL + busy_timeout + shared cache
		dsn = fmt.Sprintf("file:%s?cache=shared&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)", filePath)
		return
	}
	// fallback: ephemeral filesystem (หายเมื่อรีดีพลอย)
	filePath = "work.db"
	dsn = "file:work.db?cache=shared&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)"
	return
}

// --------------------- Connect DB ---------------------
func ConnectionDB() {
	dsn, filePath := resolveDSN()

	// สร้างโฟลเดอร์ปลายทางถ้ายังไม่มี
	if dir := filepath.Dir(filePath); dir != "." && dir != "/" {
		_ = os.MkdirAll(dir, 0o755)
	}

	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: &CustomLogger{},
	})
	if err != nil {
		panic("failed to connect database: " + err.Error())
	}
	db = database
	log.Println("✅ Connected SQLite:", filePath)

	// ตั้งค่า connection pool สำหรับ SQLite
	sqlDB, err := db.DB()
	if err == nil && sqlDB != nil {
		sqlDB.SetMaxOpenConns(1) // สำคัญ: single writer
		sqlDB.SetMaxIdleConns(1)
		sqlDB.SetConnMaxLifetime(time.Hour)
		_ = enableSQLitePragmas(sqlDB) // เปิด foreign_keys/wal/busy_timeout ซ้ำอีกครั้ง
	}

	// ย้ำ PRAGMA เผื่อบางกรณี
	db.Exec("PRAGMA journal_mode=WAL;")
	db.Exec("PRAGMA busy_timeout = 10000;")
	db.Exec("PRAGMA foreign_keys = ON;")
}

func enableSQLitePragmas(sqlDB *sql.DB) error {
	if sqlDB == nil {
		return nil
	}
	_, _ = sqlDB.Exec(`PRAGMA foreign_keys = ON;`)
	_, _ = sqlDB.Exec(`PRAGMA journal_mode = WAL;`)
	_, _ = sqlDB.Exec(`PRAGMA busy_timeout = 10000;`)
	return nil
}

// --------------------- Migrate & Seed ---------------------
func SetupDatabase() {
	// AutoMigrate ทุก entity
	if err := db.AutoMigrate(
		&entity.SolarRealtimeData{},
		&entity.Brand{},
		&entity.Hardware{},
		&entity.EnergySource{},
		&entity.Solar{},
		&entity.Modal{},
		&entity.SendEmail{},
		&entity.OTP{},
		&entity.User{},
		&entity.Car{},
		&entity.PaymentCoin{},
		&entity.EVCabinet{},
		&entity.Booking{},
		&entity.UserRoles{},
		&entity.Genders{},
		&entity.Employee{},
		&entity.Report{},
		&entity.Review{},
		&entity.Like{},
		&entity.Calendar{},
		&entity.EVcharging{},
		&entity.GettingStarted{},
		&entity.New{},
		&entity.Status{},
		&entity.Type{},
		&entity.Payment{},
		&entity.Method{},
		&entity.EVChargingPayment{},
		&entity.Bank{},
		&entity.Service{},
		&entity.ChargingSession{},
	); err != nil {
		log.Fatalf("automigrate failed: %v", err)
	}

	// master/idempotent
	seedMasters(db)

	// ถ้ายังไม่มี user → ค่อย seed user/employee/car (เงื่อนไขจาก count)
	SeedIfUsersEmpty(db)

	// เนื้อหาอื่น ๆ (จะใช้ FirstOrCreate ให้ idempotent)
	seedContent(db)

	// ตัวอย่าง seed payments (idempotent ด้วยการเช็ค count)
	// ข้อมูลรถ
	SeedVehicleCatalog(db)

	// ตัวอย่าง: seed payments หากยังไม่มี
	userID := uint(1)
	methodID := uint(1)
	cabinetID := uint(1)
	if err := SeedPayments(db, userID, methodID, cabinetID); err != nil {
		log.Fatalf("Seed payments failed: %v", err)
	}

	log.Println("✅ SetupDatabase done.")
}

// ----------------------------- Master seeds -----------------------------

func seedMasters(db *gorm.DB) {
	// Genders
	genderMale := entity.Genders{Gender: "Male"}
	genderFemale := entity.Genders{Gender: "Female"}
	db.FirstOrCreate(&genderMale, &entity.Genders{Gender: "Male"})
	db.FirstOrCreate(&genderFemale, &entity.Genders{Gender: "Female"})

	// แปลงเวลาให้เป็น time.Time (ตาม timestamp ที่ส่งมาจาก JSON)
	timestamp, _ := time.Parse("2006-01-02T15:04:05.999999", "2025-11-18T13:30:01.628179")

	alertsBytes, _ := json.Marshal([]string{}) // หรือจะใส่ ["overvoltage"] ก็ได้

	// SolarRealtimeData (ตัวอย่าง)
	solarData := entity.SolarRealtimeData{
		DeviceID:          "solar_001",
		Timestamp:         timestamp,
		PowerIn:           3198.04,
		PowerOut:          2800.50,
		BatteryPercentage: 88.14,
		BatteryPower:      1200.00,
		Voltage:           380.5,
		Current:           7.4,
		GridPower: 8.5,
		SolarIrradiance:   800.0,
		Temperature:       25.6,
		PanelTemperature:  42.3,
		Efficiency:        94.2,
		Frequency:         50.0,
		DailyEnergy:       15.4,
		TotalEnergy:       1247.8,
		Status:            "normal",
		Alerts:            datatypes.JSON(alertsBytes),
	}

	// ป้องกันข้อมูลซ้ำ: ใช้ DeviceID + Timestamp เป็นเงื่อนไข
	db.FirstOrCreate(
		&solarData,
		entity.SolarRealtimeData{
			DeviceID:  "solar_001",
			Timestamp: timestamp,
		},
	)

	// Energy Sourse
	energySolar := entity.EnergySource{
		Name: "Solar",
	}

	energyGrid := entity.EnergySource{
		Name: "Grid",
	}

	// ถ้ายังไม่มีใน DB ให้สร้าง ถ้ามีแล้วก็จะไม่สร้างซ้ำ
	db.FirstOrCreate(&energySolar, &entity.EnergySource{Name: "Solar"})
	db.FirstOrCreate(&energyGrid, &entity.EnergySource{Name: "Grid"})

	// Banking (ตัวอย่าง)
	Hardware := entity.Hardware{
		Name: "Hardware One",
		UrlWebsocket:   "wss://api.evstation-sut.it.com/hardware/",
		HardwarePoint:   "hardware_001",
	}
	db.FirstOrCreate(&Hardware, &entity.Hardware{HardwarePoint: "hardware_001"})

	s1 := entity.Solar{
		Name:         "Solar Cell",
		UrlWebsocket: "wss://api.evstation-sut.it.com/solar/",
		SolarPoint:   "solar_001",

		Description: "Main solar panel for EV project",
		Picture:     "uploads/user/solarpic.jpg",
		Location:    "Building A, Roof Floor",
	}

	// สร้างถ้ายังไม่มี
	db.FirstOrCreate(&s1, entity.Solar{Name: "Solar Cell"})

	// Methods (แก้คำสะกดให้ตรงกัน)
	method1 := entity.Method{Medthod: "QR Payment"}
	method2 := entity.Method{Medthod: "Coin Payment"}
	db.FirstOrCreate(&method1, &entity.Method{Medthod: "QR Payment"})
	db.FirstOrCreate(&method2, &entity.Method{Medthod: "Coin Payment"})

	// Roles
	adminRole := entity.UserRoles{RoleName: "Admin"}
	employeeRole := entity.UserRoles{RoleName: "Employee"}
	userRole := entity.UserRoles{RoleName: "User"}
	db.FirstOrCreate(&adminRole, &entity.UserRoles{RoleName: "Admin"})
	db.FirstOrCreate(&employeeRole, &entity.UserRoles{RoleName: "Employee"})
	db.FirstOrCreate(&userRole, &entity.UserRoles{RoleName: "User"})

	// Banking (ตัวอย่าง)
	banking := entity.Bank{
		PromptPay: "0935096372",
		Manager:   "MR. TAWANCHAI BURAKHON",
		Banking:   "006",
		Minimum:   100,
	}
	db.FirstOrCreate(&banking, &entity.Bank{PromptPay: "0935096372"})
}

// ----------------------------- Conditional seed (Users Empty) -----------------------------

func SeedIfUsersEmpty(db *gorm.DB) {
	// 1) เช็คว่ามี user อยู่แล้วหรือยัง
	var userCount int64
	if err := db.Model(&entity.User{}).Count(&userCount).Error; err != nil {
		log.Fatalf("count users failed: %v", err)
	}
	if userCount > 0 {
		log.Println("[seed] users already exist -> skip seeding users/cars/employees")
		return
	}

	// 2) ยังไม่มีข้อมูล -> seed block นี้
	hashedPassword, err := HashPassword("123")
	if err != nil {
		log.Fatalf("failed to hash password: %v", err)
	}

	// Users
	user1 := entity.User{
		Username:    "user1",
		FirstName:   "Janis",
		LastName:    "Green",
		Email:       "janis.green@example.com",
		Password:    hashedPassword,
		Profile:     "uploads/user/avatar1.jpg",
		PhoneNumber: "0935096372",
		Coin:        10000,
		GenderID:    1,
		UserRoleID:  3,
	}
	user2 := entity.User{
		Username:    "user2",
		FirstName:   "Chris",
		LastName:    "Taylor",
		Email:       "chris.taylor@example.com",
		Password:    hashedPassword,
		Profile:     "uploads/user/avatar2.jpg",
		PhoneNumber: "0895845671",
		Coin:        0,
		GenderID:    2,
		UserRoleID:  3,
	}
	user3 := entity.User{
		Username:    "user3",
		FirstName:   "Alex",
		LastName:    "Smith",
		Email:       "alex.smith@example.com",
		Password:    hashedPassword,
		Profile:     "uploads/user/avatar3.png",
		PhoneNumber: "0938473272",
		Coin:        0,
		GenderID:    1,
		UserRoleID:  3,
	}
	admin1 := entity.User{
		Username:    "admin1",
		FirstName:   "Kanyapron",
		LastName:    "KD",
		Email:       "Kanyapron@gmail.com",
		Password:    hashedPassword,
		Profile:     "uploads/user/avatar4.jpg",
		PhoneNumber: "0981183501",
		Coin:        0,
		GenderID:    1,
		UserRoleID:  1,
	}
	admin2 := entity.User{
		Username:    "admin2",
		FirstName:   "Tawunchai",
		LastName:    "Burakhon",
		Email:       "Smoke@gmail.com",
		Password:    hashedPassword,
		Profile:     "uploads/user/avatar1.jpg",
		PhoneNumber: "0981183502",
		Coin:        0,
		GenderID:    2,
		UserRoleID:  1,
	}
	employeeUser := entity.User{
		Username:    "employee1",
		FirstName:   "JoJo",
		LastName:    "Smoke",
		Email:       "employee1@example.com",
		Password:    hashedPassword,
		Profile:     "uploads/user/avatar1.jpg",
		PhoneNumber: "0981183503",
		Coin:        0,
		GenderID:    2,
		UserRoleID:  2,
	}

	// ใช้ Create รวดเดียว (ตาราง users ยังว่าง)
	if err := db.Create(&user1).Error; err != nil {
		log.Fatal(err)
	}
	if err := db.Create(&user2).Error; err != nil {
		log.Fatal(err)
	}
	if err := db.Create(&user3).Error; err != nil {
		log.Fatal(err)
	}
	if err := db.Create(&admin1).Error; err != nil {
		log.Fatal(err)
	}
	if err := db.Create(&admin2).Error; err != nil {
		log.Fatal(err)
	}
	if err := db.Create(&employeeUser).Error; err != nil {
		log.Fatal(err)
	}

	// Cars (ตัวอย่าง many-to-many: ตรวจโครงสร้าง struct ของคุณให้สอดคล้อง)
	car1 := entity.Car{Brand: "Tesla", ModelCar: "Model 3", LicensePlate: "กข 0001", SpecialNumber: true, City: "กรุงเทพมหานคร", User: []entity.User{user1}}
	car2 := entity.Car{Brand: "BYD", ModelCar: "Atto 3", LicensePlate: "กข 0002", SpecialNumber: false, City: "กรุงเทพมหานคร", User: []entity.User{user2}}
	car3 := entity.Car{Brand: "MG", ModelCar: "ZS EV", LicensePlate: "กข 0003", SpecialNumber: false, City: "กรุงเทพมหานคร", User: []entity.User{user2}}
	db.FirstOrCreate(&car1, entity.Car{LicensePlate: car1.LicensePlate})
	db.FirstOrCreate(&car2, entity.Car{LicensePlate: car2.LicensePlate})
	db.FirstOrCreate(&car3, entity.Car{LicensePlate: car3.LicensePlate})

	// Employees (อ้าง UserID จริง ไม่ hard-code)
	emp1 := entity.Employee{
		Bio:        "Admin Thailand",
		Experience: "5 years of experience as an admin with Tesla company",
		Education:  "Master degree of marketing at Harvard university",
		Salary:     25000,
		UserID:     &admin1.ID,
	}
	emp2 := entity.Employee{
		Bio:        "Admin Korean",
		Experience: "100 years of experience as an admin with Tesla company",
		Education:  "Master degree of marketing at Harvard university",
		Salary:     50000,
		UserID:     &admin2.ID,
	}
	emp3 := entity.Employee{
		Bio:        "Staff Thailand",
		Experience: "5 years of experience with Tesla company",
		Education:  "Master degree of marketing at Harvard university",
		Salary:     25000,
		UserID:     &employeeUser.ID,
	}
	db.FirstOrCreate(&emp1, entity.Employee{UserID: &admin1.ID})
	db.FirstOrCreate(&emp2, entity.Employee{UserID: &admin2.ID})
	db.FirstOrCreate(&emp3, entity.Employee{UserID: &employeeUser.ID})
}

// ----------------------------- Seed other content -----------------------------

func seedContent(db *gorm.DB) {
	// หา Employee คนแรก (เอาไว้เป็นเจ้าของข้อมูลอื่น ๆ)
	var emp entity.Employee
	if err := db.First(&emp).Error; err != nil {
		// ถ้าไม่มี ก็ไม่ต้องผูก
		emp = entity.Employee{}
	}
	var empIDPtr *uint
	if emp.ID != 0 {
		empIDPtr = &emp.ID
	}

	// GettingStarted
	getting1 := entity.GettingStarted{
		Picture:     "uploads/getting_started/gettingone.png",
		Title:       "Get ready",
		Description: "Park your car so that the charging port is as close to the charging station as possible, then turn off the engine and drivetrain and select the charging port that matches your car's port.",
		EmployeeID:  empIDPtr,
	}
	getting2 := entity.GettingStarted{
		Picture:     "uploads/getting_started/gettingtwo.png",
		Title:       "Start connecting and charging",
		Description: "Insert the charger head firmly into the vehicle's port until it locks into place. Press the Start button on the app or on the charger's screen to begin the charging process.",
		EmployeeID:  empIDPtr,
	}
	getting3 := entity.GettingStarted{
		Picture:     "uploads/getting_started/gettingthree.png",
		Title:       "End charging and store cable",
		Description: "When the charge reaches the desired level, press the Cancel or Finish button on the charger or in the app to stop charging.",
		EmployeeID:  empIDPtr,
	}
	db.FirstOrCreate(&getting1, entity.GettingStarted{Title: "Get ready"})
	db.FirstOrCreate(&getting2, entity.GettingStarted{Title: "Start connecting and charging"})
	db.FirstOrCreate(&getting3, entity.GettingStarted{Title: "End charging and store cable"})

	// News
	news1 := entity.New{
		Picture:     "uploads/new/news1.png",
		Title:       "Personalized Profession Online Tutor on Your Schedule 1",
		Description: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Necessitatibus atque voluptas labore nemo ipsam voluptatum maxime facere hic...",
		EmployeeID:  empIDPtr,
	}
	news2 := entity.New{
		Picture:     "uploads/new/news2.png",
		Title:       "Personalized Profession Online Tutor on Your Schedule 2",
		Description: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Necessitatibus atque voluptas labore nemo ipsam voluptatum maxime facere hic...",
		EmployeeID:  empIDPtr,
	}
	db.FirstOrCreate(&news1, entity.New{Title: "Personalized Profession Online Tutor on Your Schedule 1"})
	db.FirstOrCreate(&news2, entity.New{Title: "Personalized Profession Online Tutor on Your Schedule 2"})

	// Reviews (ตัวอย่างใช้ UserID = 1,2,3 ถ้ามี)
	uid1, uid2, uid3 := uint(1), uint(2), uint(3)
	review1 := &entity.Review{
		Rating:     5,
		Comment:    "The charging station was spotless and the charging speed was excellent. The waiting area was comfortable and even had outlets for my phone. Super convenient!",
		ReviewDate: time.Now(),
		Status:     true,
		UserID:     &uid1,
	}
	review2 := &entity.Review{
		Rating:     4,
		Comment:    "Stable charging and clear pricing. The staff responded quickly to my questions. It would be perfect if there were a few more parking spots.",
		ReviewDate: time.Now(),
		Status:     true,
		UserID:     &uid2,
	}
	review3 := &entity.Review{
		Rating:     3,
		Comment:    "The station works fine and the charging is okay, but the waiting area could be improved. Overall acceptable for a quick stop.",
		ReviewDate: time.Now(),
		Status:     true,
		UserID:     &uid3,
	}
	db.FirstOrCreate(review1, &entity.Review{UserID: &uid1})
	db.FirstOrCreate(review2, &entity.Review{UserID: &uid2})
	db.FirstOrCreate(review3, &entity.Review{UserID: &uid3})

	service := &entity.Service{
		Email:      "support@evstation.example",
		Phone:      "+66 2 123 4567",
		Location:   "12th Floor, EV Station Tower Building, Sukhumvit Road, Bangkok 10110",
		MapURL:     "https://maps.google.com/?q=EV+Station+Tower",
		EmployeeID: &emp.ID,
	}

	db.FirstOrCreate(service, entity.Service{Email: "support@evstation.example"})

	send := &entity.SendEmail{
		Email:   "b6534240@g.sut.ac.th",
		PassApp: "wkeg dbhx tllh mtif",
	}

	db.FirstOrCreate(send, entity.SendEmail{Email: send.Email})

	cabinet1 := &entity.EVCabinet{
		Name:         "EV Station",
		Description:  "เครื่องชาร์จสำหรับรถไฟฟ้า รองรับ Solar และ Grid",
		Location:     "มหาวิทยาลัยเทคโนโลยีสุรนารี",
		Status:       "Active",
		Latitude:     14.8802,
		Longitude:    102.018,
		Image:        "uploads/cabinet/cabinet.jpg",
		UrlWebsocket: "wss://api.evstation-sut.it.com/ocpp/",
		ChargePoint:  "CP_1",
		EmployeeID:   &emp.ID,
		HardwareID: 1,
	}

	// ✅ ใช้ Where() เพื่อป้องกันซ้ำตาม Name
	db.Where(entity.EVCabinet{Name: "EV Station"}).FirstOrCreate(cabinet1)

	cabinetID := uint(1)
	now := time.Now()
	loc := now.Location()
	year, month, day := now.Date()

	booking1 := &entity.Booking{
		StartDate:   time.Date(year, month, day, 8, 0, 0, 0, loc),
		EndDate:     time.Date(year, month, day, 10, 0, 0, 0, loc),
		UserID:      &uid1,
		EVCabinetID: &cabinetID,
		IsEmailSent: true,
	}
	db.FirstOrCreate(booking1, entity.Booking{
		UserID:      &uid1,
		EVCabinetID: &cabinetID,
		StartDate:   booking1.StartDate,
		EndDate:     booking1.EndDate,
		IsEmailSent: true,
	})

	// User 2 (13:00 - 15:00)
	booking2 := &entity.Booking{
		StartDate:   time.Date(year, month, day, 13, 0, 0, 0, loc),
		EndDate:     time.Date(year, month, day, 15, 0, 0, 0, loc),
		UserID:      &uid2,
		EVCabinetID: &cabinetID,
		IsEmailSent: true,
	}
	db.FirstOrCreate(booking2, entity.Booking{
		UserID:      &uid2,
		EVCabinetID: &cabinetID,
		StartDate:   booking2.StartDate,
		EndDate:     booking2.EndDate,
		IsEmailSent: true,
	})

	// User 3 (19:00 - 20:00)
	booking3 := &entity.Booking{
		StartDate:   time.Date(year, month, day, 19, 0, 0, 0, loc),
		EndDate:     time.Date(year, month, day, 20, 0, 0, 0, loc),
		UserID:      &uid3,
		EVCabinetID: &cabinetID,
		IsEmailSent: true,
	}
	db.FirstOrCreate(booking3, entity.Booking{
		UserID:      &uid3,
		EVCabinetID: &cabinetID,
		StartDate:   booking3.StartDate,
		EndDate:     booking3.EndDate,
		IsEmailSent: true,
	})

	// Status
	status1 := entity.Status{Status: "Available"}
	status2 := entity.Status{Status: "Unavailable"}
	db.FirstOrCreate(&status1, entity.Status{Status: "Available"})
	db.FirstOrCreate(&status2, entity.Status{Status: "Unavailable"})

	// Type
	type1 := entity.Type{Type: "AC Charge"}
	type2 := entity.Type{Type: "DC Charge"}
	db.FirstOrCreate(&type1, entity.Type{Type: "AC Charge"})
	db.FirstOrCreate(&type2, entity.Type{Type: "DC Charge"})

	// -----------------------------
	// ⭐ สร้าง EVcharging (ไม่มี EVCabinetID แล้ว!)
	// -----------------------------
	ev1 := entity.EVcharging{
		Name:           "Solar",
		Description:    "Solar is Good Power",
		Price:          2,
		Picture:        "uploads/evcharging/solar.jpg",
		EmployeeID:     empIDPtr,
		StatusID:       status1.ID,
		TypeID:         type1.ID,
		EnergySourceID: 1,
	}

	ev2 := entity.EVcharging{
		Name:           "Grid",
		Description:    "Grid is Bad Power",
		Price:          5,
		Picture:        "uploads/evcharging/grid.jpg",
		EmployeeID:     empIDPtr,
		StatusID:       status1.ID,
		TypeID:         type1.ID,
		EnergySourceID: 2,
	}

	// Insert ถ้ายังไม่มี
	db.FirstOrCreate(&ev1, entity.EVcharging{Name: "Solar"})
	db.FirstOrCreate(&ev2, entity.EVcharging{Name: "Grid"})

	// -----------------------------
	// ⭐ Many-to-Many Mapping
	// 1 EVcharging สามารถเป็นของหลายตู้ได้
	// 1 ตู้ก็มีหลาย EVcharging ได้เช่นกัน
	// -----------------------------
	db.Model(&ev1).Association("Cabinets").Append(cabinet1)
	db.Model(&ev2).Association("Cabinets").Append(cabinet1)

	// Calendar (อ้าง Employee คนแรกถ้ามี)
	calendar1 := entity.Calendar{
		Title:       "Staff Meeting",
		Location:    "Room A101",
		Description: "Monthly all-staff meeting",
		StartDate:   time.Date(2025, 7, 1, 9, 0, 0, 0, time.Local),
		EndDate:     time.Date(2025, 7, 1, 10, 30, 0, 0, time.Local),
		EmployeeID:  empIDPtr,
	}
	calendar2 := entity.Calendar{
		Title:       "EV Maintenance",
		Location:    "EV Station Zone B",
		Description: "Routine maintenance for EV chargers",
		StartDate:   time.Date(2025, 7, 3, 13, 0, 0, 0, time.Local),
		EndDate:     time.Date(2025, 7, 3, 15, 0, 0, 0, time.Local),
		EmployeeID:  empIDPtr,
	}
	db.FirstOrCreate(&calendar1, entity.Calendar{Title: "Staff Meeting"})
	db.FirstOrCreate(&calendar2, entity.Calendar{Title: "EV Maintenance"})

	// PaymentCoin (ตัวอย่าง)
	payment1 := entity.PaymentCoin{
		Date:            time.Now(),
		Amount:          100.00,
		ReferenceNumber: "REF2024071401",
		Picture:         "uploads/paymentcoin/1752515960262810900.jpg",
		UserID:          uint(1),
	}
	payment2 := entity.PaymentCoin{
		Date:            time.Now().Add(-24 * time.Hour),
		Amount:          250.50,
		ReferenceNumber: "REF2024071402",
		Picture:         "uploads/paymentcoin/1752515960262810900.jpg",
		UserID:          uint(1),
	}
	db.FirstOrCreate(&payment1, entity.PaymentCoin{ReferenceNumber: "REF2024071401"})
	db.FirstOrCreate(&payment2, entity.PaymentCoin{ReferenceNumber: "REF2024071402"})

	// Reports — แนว EV Station
	userID1 := uint(1)

	report1 := &entity.Report{
		Picture:     "uploads/evcharging/solar.jpg",
		Description: "หัวชาร์จใช้งานไม่ได้ ขณะเสียบกับตัวรถ กรุณาตรวจสอบอุปกรณ์ด้วยครับ",
		Status:      "Pending",
		UserID:      &userID1,
		EmployeeID:  nil,
	}

	db.FirstOrCreate(report1, entity.Report{UserID: &userID1})
}

// ----------------------------- Seed Payments -----------------------------

func SeedPayments(db *gorm.DB, userID uint, methodID uint, cabinetID uint) error {
	var count int64
	if err := db.Model(&entity.Payment{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to count payments: %w", err)
	}
	if count > 0 {
		fmt.Println("Payments already seeded, skipping creation.")
		return nil
	}

	fmt.Println("Seeding Payments for 12 months (20 days each)...")

	for month := 1; month <= 12; month++ {
		for day := 1; day <= 20; day++ { // ✅ แก้จาก 10 → 20 วัน
			createdAt := time.Date(2025, time.Month(month), day, 0, 0, 0, 0, time.UTC)

			price1 := 50 + day*2
			price2 := 100 + month*3
			amount := price1 + price2

			payment := entity.Payment{
				Date:            createdAt,
				Amount:          float64(amount),
				ReferenceNumber: fmt.Sprintf("REF-%02d%02d", month, day),
				Picture:         "uploads/payment/1752001589231877900.jpg",
				UserID:          &userID,
				MethodID:        &methodID,
				EVCabinetID:     &cabinetID,
			}

			if err := db.Create(&payment).Error; err != nil {
				return fmt.Errorf("failed to create payment: %w", err)
			}

			// 🔍 ดึงข้อมูล EVcharging 1, 2
			var ev1, ev2 entity.EVcharging
			if err := db.First(&ev1, 1).Error; err != nil {
				return fmt.Errorf("failed to find EVcharging 1: %w", err)
			}
			if err := db.First(&ev2, 2).Error; err != nil {
				return fmt.Errorf("failed to find EVcharging 2: %w", err)
			}

			quantity1 := float64(price1) / ev1.Price
			quantity2 := float64(price2) / ev2.Price

			evcp1 := entity.EVChargingPayment{
				EVchargingID: 1,
				PaymentID:    payment.ID,
				Price:        float64(price1),
				Power:        quantity1,
				Percent:      20.00,
				RemainingPower: 5,
			}
			if err := db.FirstOrCreate(
				&evcp1,
				entity.EVChargingPayment{EVchargingID: 1, PaymentID: payment.ID},
			).Error; err != nil {
				return fmt.Errorf("failed to create evchargingpayment 1: %w", err)
			}

			evcp2 := entity.EVChargingPayment{
				EVchargingID: 2,
				PaymentID:    payment.ID,
				Price:        float64(price2),
				Power:        quantity2,
				Percent:      80.00,
				RemainingPower: 2,
			}
			if err := db.FirstOrCreate(
				&evcp2,
				entity.EVChargingPayment{EVchargingID: 2, PaymentID: payment.ID},
			).Error; err != nil {
				return fmt.Errorf("failed to create evchargingpayment 2: %w", err)
			}
		}
	}

	fmt.Println("✅ Successfully seeded payments for all 12 months (20 days each).")
	return nil
}

// เรียกใช้หลัง AutoMigrate เพื่อเติมข้อมูลเริ่มต้นให้ Brand/Modal
func SeedVehicleCatalog(db *gorm.DB) error {
	data := map[string][]string{
		"AJ EV":         {"GODDESS", "NCV"},
		"Audi":          {"Audi RS E-Tron Gt", "Audi e-tron 55 quattro", "Audi e-tron GT"},
		"BMW":           {"330e", "530e", "740 Le", "745 Le xDrive M Sport", "IX", "IX3", "X1 xDrive25e", "X2 xDrive25e", "X3 xDrive30e", "X5 xDrive40e", "X5 xDrive45e", "i3", "i3s", "i7 xDrive60 2022", "i8", "iX xDrive40 Sport"},
		"BYD":           {"ATTO 3 2022", "Denza 09 EV", "Denza 09 PHEV", "Dolphin 2021", "Dolphin EV 2022", "HAN EV 2022", "M6", "SEAL EV 2022", "SEALION 6", "SEALION 7", "Tang EV 2022", "e6"},
		"Changan":       {"Deepal L07", "Deepal L07 S", "Deepal S05", "Deepal S07", "Deepal S07 L", "LUMIN L", "LUMIN L DC"},
		"Chery":         {"JAECOO 6 EV", "OMODA C5 Ev", "Tiggo 8", "V 23"},
		"FOMM":          {"One"},
		"FORD":          {"Mustang Mach E"},
		"FOXCONN":       {"MODEL C", "MODEL E"},
		"GAC":           {"AION ES", "AION UT", "AION V", "AION Y Plus", "Hyptec HT", "Hyptec SSR"},
		"GWM":           {"HAVAL PHEV", "ORA BLACKCAT", "ORA GOODCAT GT", "ORA GRAND CAT", "ORA Good Cat 400 Pro", "ORA Good Cat 400 Tech", "ORA Good Cat 500 Ultra", "ORA Good Cat Ultra", "ora good cat 07", "ora good cat GT"},
		"Geely":         {"EX5 Max", "EX5 Pro"},
		"HONDA":         {"HONDA E"},
		"Hyundai":       {"IONIQ", "IONIQ 5 2022", "IONIQ 6 2022", "Kona"},
		"JAECOO 5":      {"Long Range Dynamic", "Long Range Max"},
		"Jaguar":        {"i-PACE"},
		"Kia":           {"KIA EV +A+B37", "Kia EV5 Kia EV9", "Soul EV"},
		"LEXUS":         {"Lexus RZ 450e", "Lexus ux300e"},
		"Land Rover":    {"Range Rover Sport HSE Plus", "Range Rover Sport P400e"},
		"MG":            {"EP PLUS 2022", "ES", "HS PHEV (New)", "MG4", "Maximus (MG5)", "ZS EV", "ZS EV X 2022"},
		"MINI":          {"Cooper SE"},
		"Mercedes-Benz": {"C 300e", "C 350e", "E 300e", "E350e", "EQB 250", "EQS", "EQS 500 4MATIC", "GLC 300 e4Metric", "GLC 350 e4MATRIC", "GLC 500e", "GLE 500e", "S500e", "S560e"},
		"Mitsubishi":    {"Outander Phev (NEW)", "i-Miev"},
		"Neta":          {"NETA S", "NETA V", "Neta U Pro", "V II", "x"},
		"Nissan":        {"Ariya", "Leaf"},
		"Peugeot":       {"e-2008 SUV"},
		"Pocco":         {"DD", "MM"},
		"Porsche":       {"Cayenne S E-Hybrid", "Panamera 4 E-Hybrid", "TAYCAN 4S 2022", "TAYCAN GTS 2022", "Taycan"},
		"Takano":        {"TTE 500"},
		"Tesla":         {"Model 3 Long Range", "Model 3 Performance", "Model 3 Standard Range Plus", "Model S Long Range", "Model S Performance", "Model S Standard", "Model X Long Range Plus", "Model X Performance", "Model Y Long Range", "Model Y Performance"},
		"Toyota":        {"BZ4"},
		"Volvo":         {"C40", "S60 T8", "S90 T8", "V60 T8", "V90 T8", "XC40", "XC60 T8", "XC90 T8"},
		"Xpeng":         {"G6", "X9"},
		"ZEEKR":         {"ZEEKR X", "ZEEKR 009"},
	}

	// ใช้ Transaction เพื่อความถูกต้องของชุดข้อมูล
	return db.Transaction(func(tx *gorm.DB) error {
		for brandName, modals := range data {
			cleanBrand := strings.TrimSpace(brandName)
			if cleanBrand == "" {
				continue
			}

			// ✅ Create or get Brand
			var brand entity.Brand
			if err := tx.
				Where("brand_name = ?", cleanBrand).
				FirstOrCreate(&brand, entity.Brand{BrandName: cleanBrand}).Error; err != nil {
				return fmt.Errorf("seed brand '%s' failed: %w", cleanBrand, err)
			}

			// ✅ Create or get each Modal
			for _, m := range modals {
				cleanModal := strings.TrimSpace(m)
				if cleanModal == "" {
					continue
				}
				var modal entity.Modal
				if err := tx.
					Where("modal_name = ? AND brand_id = ?", cleanModal, brand.ID).
					FirstOrCreate(&modal, entity.Modal{
						ModalName: cleanModal,
						BrandID:   &brand.ID,
					}).Error; err != nil {
					return fmt.Errorf("seed modal '%s' of brand '%s' failed: %w", cleanModal, cleanBrand, err)
				}
			}
		}
		return nil
	})
}
