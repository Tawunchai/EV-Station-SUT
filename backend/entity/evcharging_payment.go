package entity

import "gorm.io/gorm"

type EVChargingPayment struct {
    gorm.Model

    EVchargingID uint
    EVcharging   EVcharging `gorm:"foreignKey:EVchargingID"`

    PaymentID uint
    Payment   Payment `gorm:"foreignKey:PaymentID"`

    Price   float64
    Percent float64     // เปอร์เซ็นต์ที่ซื้อมา เช่น 100%
    Power   float64     // จำนวน kWh ที่ซื้อมา เช่น 10 kWh

    // ⭐ เพิ่มฟิลด์ใหม่: ค่าที่เหลือเมื่อกดยกเลิก
    RemainingPower   float64  // kWh ที่ยังเหลือ
}
