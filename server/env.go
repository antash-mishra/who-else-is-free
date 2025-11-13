package main

import (
	"errors"
	"log"
	"os"

	"github.com/joho/godotenv"
)

// loadServerEnv hydrates process envs from an .env file when present.
func loadServerEnv() {
	// Try the repo root location first (useful when running from the project root),
	// then fall back to the in-package path when running from elsewhere.
	if err := godotenv.Load(".env"); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			log.Printf("warning: failed to load .env: %v", err)
		}
		if err := godotenv.Load("server/.env"); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("warning: failed to load server/.env: %v", err)
		}
	}
}
