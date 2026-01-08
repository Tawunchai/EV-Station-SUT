package entity

import "gorm.io/gorm"

type Meter struct {
	gorm.Model

	Name         string `json:"name"`
	UrlWebsocket string `json:"url_websocket"`
	MeterPoint   string `json:"meter_point"`
	Description string `json:"description"`

	
	Solar []Solar `gorm:"foreignKey:MeterID"`
}
