package entity

import (
	"gorm.io/gorm"
)

type EVcharging struct {
	gorm.Model
	Name        string
	Description string
	Price       float64
	Picture     string

	EmployeeID *uint
	Employee   Employee `gorm:"foreignKey:EmployeeID"`

	StatusID uint
	Status   *Status `gorm:"foreignKey:StatusID"`

	TypeID uint
	Type   *Type `gorm:"foreignKey:TypeID"`

	EnergySourceID uint
	EnergySource   *EnergySource `gorm:"foreignKey:EnergySourceID"`

	// ⭐ Many-to-Many ผ่านตารางกลาง
	Cabinets []EVCabinet `gorm:"many2many:ev_cabinet_ev_chargings;"`

	EVChargingPayments []EVChargingPayment `gorm:"foreignKey:EVchargingID"`
}
