package entity

import (
	"gorm.io/gorm"
)

type EnergySource struct {
	gorm.Model
	Name        string
}