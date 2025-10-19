package main

import (
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func setupRouter(eventHandler *EventHandler, authHandler *AuthHandler, chatHub *ChatHub, signer *tokenSigner) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:  []string{"*"},
		AllowMethods:  []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:  []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders: []string{"Content-Length"},
		MaxAge:        12 * time.Hour,
	}))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	authHandler.RegisterRoutes(api)
	eventHandler.RegisterRoutes(api)

	protected := api.Group("")
	protected.Use(sessionMiddleware(signer))
	eventHandler.RegisterProtectedRoutes(protected)
	RegisterChatRoutes(protected, eventHandler.repo, chatHub)

	api.GET("/ws", chatHub.handleWebSocket)

	return r
}
