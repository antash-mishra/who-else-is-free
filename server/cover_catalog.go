package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"path/filepath"
)

type CoverCategory struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type CoverOption struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	FileName string   `json:"file_name"`
	URL      string   `json:"url,omitempty"`
	Category string   `json:"category,omitempty"`
	Tags     []string `json:"tags,omitempty"`
}

//go:embed covers_catalog.json
var coverCatalogJSON []byte

var (
	coverCatalog    []CoverOption
	coverCategories []CoverCategory
	coverKeyIndex   map[string]int
)

func init() {
	covers, categories, err := parseCoverCatalog(coverCatalogJSON)
	if err != nil {
		panic(fmt.Sprintf("invalid covers_catalog.json: %v", err))
	}
	coverCatalog = covers
	coverCategories = categories
	coverKeyIndex = make(map[string]int, len(coverCatalog))
	for i, option := range coverCatalog {
		coverKeyIndex[option.Key] = i
	}
}

func parseCoverCatalog(data []byte) ([]CoverOption, []CoverCategory, error) {
	var payload struct {
		Categories []CoverCategory `json:"categories"`
		Covers     []CoverOption   `json:"covers"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, nil, err
	}
	if len(payload.Covers) == 0 {
		return nil, nil, fmt.Errorf("catalog has no covers")
	}
	if len(payload.Categories) == 0 {
		return nil, nil, fmt.Errorf("catalog has no categories")
	}
	return payload.Covers, payload.Categories, nil
}

func listCoverOptions() []CoverOption {
	options := make([]CoverOption, len(coverCatalog))
	copy(options, coverCatalog)
	return options
}

func listCoverCategories() []CoverCategory {
	categories := make([]CoverCategory, len(coverCategories))
	copy(categories, coverCategories)
	return categories
}

func isValidCoverKey(key string) bool {
	_, ok := coverKeyIndex[key]
	return ok
}

func coverFileNameForKey(key string) string {
	if i, ok := coverKeyIndex[key]; ok {
		return coverCatalog[i].FileName
	}
	return defaultCoverKey + ".png"
}

func coverAssetsDir() string {
	return filepath.Clean("assets/covers")
}
