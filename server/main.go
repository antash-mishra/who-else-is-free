package main

import (
	"context"
	"log"
	"time"
)

const databasePath = "event.sqlite"

func main() {
	database, err := openDB(databasePath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer func() {
		if err := database.Close(); err != nil {
			log.Printf("error closing database: %v", err)
		}
	}()

    // Load optional server/.env so local dev can configure secrets easily.
    loadServerEnv()

	repo := NewEventRepository(database)

	signer, err := newTokenSignerFromEnv()
	if err != nil {
		log.Fatalf("failed to load session signer: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := repo.Init(ctx); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	if err := repo.EnsureSeedData(ctx); err != nil {
		log.Printf("failed to seed database: %v", err)
	}

	eventHandler := NewEventHandler(repo)
	authHandler := NewAuthHandler(repo, signer)
	chatHub := NewChatHub(repo, signer)
	go chatHub.Run()
	srv := setupRouter(eventHandler, authHandler, chatHub, signer)

	if err := srv.Run(); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
