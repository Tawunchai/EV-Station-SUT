package entity

import "time"

type ChargingSession struct {
	ID        uint   `gorm:"primaryKey"`
	UserID    uint   `gorm:"not null"`
	Token     string `gorm:"uniqueIndex"`
	ExpiresAt time.Time
	CreatedAt time.Time
	StartTime time.Time
	EndTime time.Time
	Status bool

	StartEnergy float64  

	PaymentID uint
	Payment   Payment `gorm:"foreignKey:PaymentID"`
}
