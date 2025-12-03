// entity/solar_realtime_data.go

package entity

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type SolarRealtimeData struct {
	gorm.Model

	// จาก payload
	DeviceID  string    `json:"device_id" gorm:"index"` // solar_001
	Timestamp time.Time `json:"timestamp" gorm:"index"` // 2025-11-18T13:30:01.628179

	// จาก data
	PowerIn           float64 `json:"power_in"`            // W
	PowerOut          float64 `json:"power_out"`           // W
	BatteryPercentage float64 `json:"battery_percentage"`  // %
	BatteryPower      float64 `json:"battery_power"`       // W
	GridPower         float64 `json:"grid_power"`          // W (กำลังที่เกี่ยวกับกริด)
	Voltage           float64 `json:"voltage"`             // V
	Current           float64 `json:"current"`             // A
	SolarIrradiance   float64 `json:"solar_irradiance"`    // W/m²
	Temperature       float64 `json:"temperature"`         // °C
	PanelTemperature  float64 `json:"panel_temperature"`   // °C
	Efficiency        float64 `json:"efficiency"`          // %
	Frequency         float64 `json:"frequency"`           // Hz
	DailyEnergy       float64 `json:"daily_energy"`        // kWh
	TotalEnergy       float64 `json:"total_energy"`        // kWh
	Status            string  `json:"status"`              // normal / warning / fault ฯลฯ

	// alerts เป็น array เลยใช้ JSON type ของ GORM
	Alerts datatypes.JSON `json:"alerts" gorm:"type:json"` // เก็บ []string หรือ object อื่น ๆ ได้
}
