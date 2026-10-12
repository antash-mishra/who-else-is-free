package main

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// testCoverCatalogJSON has active covers plus retired ones whose folder is
// still populated, whose folder is gone, whose category is gone, and one placed
// directly in a category.
const testCoverCatalogJSON = `{
  "categories": [
    {"key": "sports", "label": "Sports"},
    {"key": "food-drinks", "label": "Food & Drinks"},
    {"key": "generic", "label": "Generic"}
  ],
  "covers": [
    {"key": "sports-badminton-1", "label": "Badminton", "file_name": "sports-badminton-1.png", "category": "sports", "tags": ["Badminton"]},
    {"key": "food-drinks-brunch-1", "label": "Brunch", "file_name": "food-drinks-brunch-1.png", "category": "food-drinks", "tags": ["Brunch", "Food"]},
    {"key": "food-drinks-coffee-1", "label": "Coffee", "file_name": "food-drinks-coffee-1.png", "category": "food-drinks", "tags": ["Coffee"]},
    {"key": "generic-1", "label": "Generic", "file_name": "generic-1.png", "category": "generic", "tags": []},
    {"key": "food-drinks-brunch-2", "label": "Brunch", "file_name": "food-drinks-brunch-2.png", "category": "food-drinks", "tags": ["Brunch", "Food"], "retired": true},
    {"key": "food-drinks-wine-1", "label": "Wine", "file_name": "food-drinks-wine-1.png", "category": "food-drinks", "tags": ["Wine"], "retired": true},
    {"key": "outdoor-nature-1", "label": "Outdoor & Nature", "file_name": "outdoor-nature-1.png", "category": "outdoor-nature", "tags": [], "retired": true},
    {"key": "generic-2", "label": "Generic", "file_name": "generic-2.png", "category": "generic", "tags": [], "retired": true}
  ]
}`

func mustParseTestCoverCatalog(t *testing.T) *coverIndex {
	t.Helper()
	index, err := parseCoverCatalog([]byte(testCoverCatalogJSON))
	if err != nil {
		t.Fatalf("parse test catalog: %v", err)
	}
	return index
}

func TestCoverCatalogLoads(t *testing.T) {
	if len(coverCatalog.active) == 0 {
		t.Fatal("cover catalog is empty")
	}
	if len(coverCatalog.categories) == 0 {
		t.Fatal("cover categories are empty")
	}
}

// The events table, the server and the app all fall back to the default key,
// so it must stay active. Its position in the picker does not matter.
func TestDefaultCoverKeyIsActive(t *testing.T) {
	for _, option := range coverCatalog.active {
		if option.Key == defaultCoverKey {
			return
		}
	}
	t.Fatalf("default cover key %q is not an active catalog cover", defaultCoverKey)
}

func TestLegacyCoverKeysAreInvalid(t *testing.T) {
	for _, legacy := range []string{"badminton", "chess", "wine", "yoga1"} {
		if isValidCoverKey(legacy) {
			t.Fatalf("legacy key %q should no longer be valid", legacy)
		}
	}
}

func TestParseCoverCatalogSeparatesRetiredCovers(t *testing.T) {
	index := mustParseTestCoverCatalog(t)

	var active []string
	for _, option := range index.active {
		active = append(active, option.Key)
	}
	if want := []string{"sports-badminton-1", "food-drinks-brunch-1", "food-drinks-coffee-1", "generic-1"}; !reflect.DeepEqual(active, want) {
		t.Fatalf("active = %v, want %v", active, want)
	}
	for _, key := range []string{"sports-badminton-1", "food-drinks-brunch-2", "food-drinks-wine-1", "outdoor-nature-1", "generic-2"} {
		if !index.known[key] {
			t.Fatalf("%q should be a known key", key)
		}
	}
	if index.known["food-drinks-brunch-9"] {
		t.Fatal("unlisted keys must stay unknown")
	}
	if got := index.knownKeys(); len(got) != 8 || got[0] != "food-drinks-brunch-1" {
		t.Fatalf("knownKeys = %v", got)
	}
}

func TestRetiredCoversGetSimilarStandIns(t *testing.T) {
	index := mustParseTestCoverCatalog(t)
	want := map[string]string{
		"food-drinks-brunch-2": "food-drinks-brunch-1", // same folder
		"food-drinks-wine-1":   "food-drinks-brunch-1", // folder gone: same category
		"outdoor-nature-1":     defaultCoverKey,        // category gone: default
		"generic-2":            "generic-1",            // placed directly in a category
	}
	if !reflect.DeepEqual(index.standIns, want) {
		t.Fatalf("standIns = %v, want %v", index.standIns, want)
	}
}

func TestParseCoverCatalogKeepsTags(t *testing.T) {
	index := mustParseTestCoverCatalog(t)
	if brunch := index.active[1]; !reflect.DeepEqual(brunch.Tags, []string{"Brunch", "Food"}) {
		t.Fatalf("brunch tags = %v", brunch.Tags)
	}
	if generic := index.active[3]; generic.Category != "generic" || len(generic.Tags) != 0 {
		t.Fatalf("generic cover = %+v", generic)
	}
}

func TestParseCoverCatalogRejectsBrokenCatalogs(t *testing.T) {
	cases := map[string]string{
		"no categories":       `{"categories": [], "covers": [{"key": "a-1", "file_name": "a-1.png"}]}`,
		"only retired covers": `{"categories": [{"key": "a", "label": "A"}], "covers": [{"key": "a-1", "file_name": "a-1.png", "retired": true}]}`,
		"duplicate keys":      `{"categories": [{"key": "a", "label": "A"}], "covers": [{"key": "a-1", "file_name": "a-1.png"}, {"key": "a-1", "file_name": "a-1.png", "retired": true}]}`,
	}
	for name, raw := range cases {
		if _, err := parseCoverCatalog([]byte(raw)); err == nil {
			t.Fatalf("%s: expected an error", name)
		}
	}
}

func TestResetUnknownEventCoverKeysKeepsRetiredKeys(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	insert := func(coverKey string) int64 {
		t.Helper()
		res, err := repo.db.ExecContext(ctx,
			`INSERT INTO events (user_id, title, location, time, event_date, gender, min_age, max_age, date_label, cover_key)
			 VALUES (1, 'Plan', 'Park', '10:00', '2026-10-20', 'Any', 18, 40, 'Today', ?)`, coverKey)
		if err != nil {
			t.Fatalf("insert event: %v", err)
		}
		id, err := res.LastInsertId()
		if err != nil {
			t.Fatalf("event id: %v", err)
		}
		return id
	}
	want := map[int64]string{
		insert("food-drinks-brunch-2"): "food-drinks-brunch-2", // retired: kept
		insert("food-drinks-coffee-1"): "food-drinks-coffee-1",
		insert("legacy-cover"):         defaultCoverKey,
		insert("  "):                   defaultCoverKey,
	}

	if err := repo.resetUnknownEventCoverKeys(ctx, mustParseTestCoverCatalog(t).knownKeys()); err != nil {
		t.Fatalf("resetUnknownEventCoverKeys: %v", err)
	}

	for id, wantKey := range want {
		var got string
		if err := repo.db.QueryRowContext(ctx, `SELECT cover_key FROM events WHERE id = ?`, id).Scan(&got); err != nil {
			t.Fatalf("read event %d: %v", id, err)
		}
		if got != wantKey {
			t.Fatalf("event %d cover_key = %q, want %q", id, got, wantKey)
		}
	}
}

func TestCoverCatalogIntegrity(t *testing.T) {
	// Cover images are not committed; they are fetched at deploy time via
	// `covers-sync -fetch`. Skip the on-disk checks on a fresh checkout.
	if entries, err := os.ReadDir(coverAssetsDir()); err != nil || len(entries) == 0 {
		t.Skip("cover assets not present locally; run `go run ./cmd/covers-sync -fetch`")
	}

	categoryKeys := make(map[string]bool, len(coverCatalog.categories))
	for _, category := range coverCatalog.categories {
		categoryKeys[category.Key] = true
	}

	// Retired covers have no image; the server serves their stand-in's.
	referenced := make(map[string]bool, len(coverCatalog.active))
	for _, option := range coverCatalog.active {
		if !categoryKeys[option.Category] {
			t.Fatalf("cover %q references unknown category %q", option.Key, option.Category)
		}
		if option.FileName != option.Key+".png" {
			t.Fatalf("cover %q file name %q != key-derived name", option.Key, option.FileName)
		}
		path := filepath.Join(coverAssetsDir(), option.FileName)
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("cover %q asset missing: %v", option.Key, err)
		}
		referenced[option.FileName] = true
	}

	entries, err := os.ReadDir(coverAssetsDir())
	if err != nil {
		t.Fatalf("read assets dir: %v", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() && !referenced[entry.Name()] {
			t.Fatalf("orphan asset %q not referenced by catalog", entry.Name())
		}
	}
}
