package Energy

import (
	"net/http"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
	"github.com/gin-gonic/gin"
)

// GET /energy-sources
func ListEnergySource(c *gin.Context) {
	var sources []entity.EnergySource
	db := config.DB()

	result := db.Find(&sources)

	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, sources)
}