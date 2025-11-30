package entity

import (
	"gorm.io/gorm"
)

type EVCabinet struct {
	gorm.Model

	Name        string 
	Description string  
	Location    string  
	Status      string  
	UrlWebsocket string
	ChargePoint string
	Latitude    float64 
	Longitude   float64
	Image       string  

	// ⭐ Many-to-Many กลับฝ่าย EVcharging
    EVchargings []EVcharging `gorm:"many2many:ev_cabinet_ev_chargings;"` 
	Booking     []Booking    `gorm:"foreignKey:EVCabinetID"`
	
	Payment     []Payment    `gorm:"foreignKey:EVCabinetID"` 

	EmployeeID  *uint       
	Employee    Employee     `gorm:"foreignKey:EmployeeID"`

	
	HardwareID uint
	Hardware   Hardware `gorm:"foreignKey:HardwareID"`
}
