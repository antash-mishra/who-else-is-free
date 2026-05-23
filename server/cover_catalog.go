package main

import (
	"path/filepath"
)

type CoverOption struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	FileName string `json:"file_name"`
	URL      string `json:"url,omitempty"`
}

var coverCatalog = []CoverOption{
	{Key: "badminton", Label: "Badminton", FileName: "badminton.png"},
	{Key: "board-games", Label: "Board Games", FileName: "board-games.png"},
	{Key: "book", Label: "Book Club", FileName: "book.png"},
	{Key: "brunch", Label: "Brunch", FileName: "brunch.png"},
	{Key: "brunch1", Label: "Brunch Alt", FileName: "brunch1.png"},
	{Key: "chess", Label: "Chess", FileName: "chess.png"},
	{Key: "coffee", Label: "Coffee", FileName: "coffee.png"},
	{Key: "comedy", Label: "Comedy", FileName: "comedy.png"},
	{Key: "crochet", Label: "Crochet", FileName: "crochet.png"},
	{Key: "gig", Label: "Gig", FileName: "gig.png"},
	{Key: "karaoke", Label: "Karaoke", FileName: "karaoke.png"},
	{Key: "martial-arts", Label: "Martial Arts", FileName: "martial-arts.png"},
	{Key: "museum", Label: "Museum", FileName: "museum.png"},
	{Key: "museum1", Label: "Museum Alt", FileName: "museum1.png"},
	{Key: "pool", Label: "Pool", FileName: "pool.png"},
	{Key: "running", Label: "Running", FileName: "running.png"},
	{Key: "running1", Label: "Running Alt", FileName: "running1.png"},
	{Key: "surfing", Label: "Surfing", FileName: "surfing.png"},
	{Key: "swimming", Label: "Swimming", FileName: "swimming.png"},
	{Key: "tennis", Label: "Tennis", FileName: "tennis.png"},
	{Key: "video-games", Label: "Video Games", FileName: "video-games.png"},
	{Key: "wine", Label: "Wine", FileName: "wine.png"},
	{Key: "workout", Label: "Workout", FileName: "workout.png"},
	{Key: "yoga", Label: "Yoga", FileName: "yoga.png"},
	{Key: "yoga1", Label: "Yoga Alt", FileName: "yoga1.png"},
	{Key: "photography", Label: "Photography", FileName: "photography.png"},
}

func listCoverOptions() []CoverOption {
	options := make([]CoverOption, len(coverCatalog))
	copy(options, coverCatalog)
	return options
}

func isValidCoverKey(key string) bool {
	for _, option := range coverCatalog {
		if option.Key == key {
			return true
		}
	}
	return false
}

func coverFileNameForKey(key string) string {
	for _, option := range coverCatalog {
		if option.Key == key {
			return option.FileName
		}
	}
	return defaultCoverKey + ".png"
}

func coverAssetsDir() string {
	return filepath.Clean("assets/covers")
}
