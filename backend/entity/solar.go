package entity

import "gorm.io/gorm"

type Solar struct {
	gorm.Model

	Name         string `json:"name"`
	UrlWebsocket string `json:"url_websocket"`
	SolarPoint   string `json:"solar_point"`

	Description string `json:"description"`
	Picture     string `json:"picture"`
	Location    string `json:"location"`

	
	MeterID      *uint 
	Meter        Meter   `gorm:"foreignKey:MeterID"` 
}
