package main

import (
	"errors"
	"log"
	"os"

	"github.com/joho/godotenv"
)

// loadServerEnv hydrates process envs from server/.env when present.
func loadServerEnv() {
	if err := godotenv.Load("server/.env"); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			log.Printf("warning: failed to load server/.env: %v", err)
		}
	}
}
