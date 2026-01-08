// entity/meter_realtime_data.go

package entity

import (
	"time"

	"gorm.io/gorm"
)

type MeterRealtimeData struct {
	gorm.Model

	// จาก payload
	DeviceID  string    `json:"device_id" gorm:"index"` // เช่น solar_001
	Timestamp time.Time `json:"timestamp" gorm:"index"` // เช่น 2025-11-18T13:30:01.628179

	// จาก data (ค่ามิเตอร์)
	W    float64 `json:"w" gorm:"type:decimal(18,6)"`    // Real/Active Power (Watt)
	Var  float64 `json:"var" gorm:"type:decimal(18,6)"`  // Reactive Power (var)
	VA   float64 `json:"va" gorm:"type:decimal(18,6)"`   // Apparent Power (VA)
	Vrms float64 `json:"vrms" gorm:"type:decimal(18,6)"` // Voltage RMS (V)
	Irms float64 `json:"irms" gorm:"type:decimal(18,6)"` // Current RMS (A)
}
