package router

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"who-else-is-free-server/internal/handlers"
)

func Setup(eventHandler *handlers.EventHandler) *gin.Engine {
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	eventHandler.RegisterRoutes(api)

	return r
}
