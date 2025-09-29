package main

import (
	"context"
	"log"
	"time"

	"who-else-is-free-server/internal/db"
	"who-else-is-free-server/internal/handlers"
	"who-else-is-free-server/internal/repository"
	"who-else-is-free-server/internal/router"
)

const databasePath = "event.sqlite"

func main() {
	database, err := db.Open(databasePath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer func() {
		if err := database.Close(); err != nil {
			log.Printf("error closing database: %v", err)
		}
	}()

	repo := repository.NewEventRepository(database)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := repo.Init(ctx); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	eventHandler := handlers.NewEventHandler(repo)
	srv := router.Setup(eventHandler)

	if err := srv.Run(); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
