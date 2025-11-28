package entity

import (
	"gorm.io/gorm"
)

type Hardware struct {
	gorm.Model
	Name          string
	HardwarePoint string
	UrlWebsocket  string
}
