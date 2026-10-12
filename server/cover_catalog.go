package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
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

// coverIndex is the parsed cover catalog. Covers removed from Drive stay in
// the catalog as retired: hidden from the picker, but still valid keys whose
// image URL serves a stand-in, so plans that use them keep working.
type coverIndex struct {
	active     []CoverOption // offered in the picker, in catalog order
	categories []CoverCategory
	known      map[string]bool   // active and retired keys
	standIns   map[string]string // retired key → active cover shown instead
}

var coverCatalog *coverIndex

func init() {
	index, err := parseCoverCatalog(coverCatalogJSON)
	if err != nil {
		panic(fmt.Sprintf("invalid covers_catalog.json: %v", err))
	}
	coverCatalog = index
}

// coverCatalogEntry is a catalog row as stored; the sync tool's bookkeeping
// fields (drive_id, sha256, ...) are not needed here.
type coverCatalogEntry struct {
	CoverOption
	Retired bool `json:"retired"`
}

func parseCoverCatalog(data []byte) (*coverIndex, error) {
	var payload struct {
		Categories []CoverCategory     `json:"categories"`
		Covers     []coverCatalogEntry `json:"covers"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	if len(payload.Categories) == 0 {
		return nil, fmt.Errorf("catalog has no categories")
	}
	index := &coverIndex{
		categories: payload.Categories,
		known:      make(map[string]bool, len(payload.Covers)),
		standIns:   make(map[string]string),
	}
	var retired []CoverOption
	for _, entry := range payload.Covers {
		if index.known[entry.Key] {
			return nil, fmt.Errorf("duplicate cover key %q", entry.Key)
		}
		index.known[entry.Key] = true
		if entry.Retired {
			retired = append(retired, entry.CoverOption)
		} else {
			index.active = append(index.active, entry.CoverOption)
		}
	}
	if len(index.active) == 0 {
		return nil, fmt.Errorf("catalog has no covers")
	}
	for _, option := range retired {
		index.standIns[option.Key] = index.standInFor(option)
	}
	return index, nil
}

// standInFor picks the active cover whose image is shown for a removed one:
// the first from the same Drive folder, else from the same category, else the
// default cover.
func (index *coverIndex) standInFor(removed CoverOption) string {
	for _, option := range index.active {
		if option.Category == removed.Category && sameCoverFolder(option.Tags, removed.Tags) {
			return option.Key
		}
	}
	for _, option := range index.active {
		if option.Category == removed.Category {
			return option.Key
		}
	}
	for _, option := range index.active {
		if option.Key == defaultCoverKey {
			return option.Key
		}
	}
	return index.active[0].Key
}

// sameCoverFolder compares covers' first tags, which name their Drive folder;
// covers without tags sit directly in their category's folder.
func sameCoverFolder(a, b []string) bool {
	if len(a) == 0 || len(b) == 0 {
		return len(a) == len(b)
	}
	return strings.EqualFold(a[0], b[0])
}

// knownKeys lists active and retired keys, sorted.
func (index *coverIndex) knownKeys() []string {
	keys := make([]string, 0, len(index.known))
	for key := range index.known {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func listCoverOptions() []CoverOption {
	options := make([]CoverOption, len(coverCatalog.active))
	copy(options, coverCatalog.active)
	return options
}

func listCoverCategories() []CoverCategory {
	categories := make([]CoverCategory, len(coverCatalog.categories))
	copy(categories, coverCatalog.categories)
	return categories
}

// isValidCoverKey accepts retired keys too, so a plan whose cover was removed
// from Drive can still be created or edited.
func isValidCoverKey(key string) bool {
	return coverCatalog.known[key]
}

func coverAssetsDir() string {
	return filepath.Clean("assets/covers")
}
