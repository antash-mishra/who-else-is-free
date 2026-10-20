package main

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestDiffCatalogs(t *testing.T) {
	sports := []catalogCategory{{Key: "sports", Label: "Sports"}}
	badminton := []string{"Badminton"}
	back := prevCover("sports-badminton-6", "sports", badminton, "back", "f.png")
	back.Retired = true
	prev := coverCatalogFile{Categories: sports, Covers: []catalogCover{
		prevCover("sports-badminton-1", "sports", badminton, "same", "a.png"),
		prevCover("sports-badminton-2", "sports", badminton, "old", "b.png"),
		prevCover("sports-badminton-3", "sports", badminton, "inplace", "c.png"),
		prevCover("sports-badminton-4", "sports", badminton, "gone", "d.png"),
		prevCover("sports-badminton-5", "sports", badminton, "renamed", "e.png"),
		back,
	}}
	next := coverCatalogFile{Categories: sports, Covers: append([]catalogCover{}, prev.Covers...)}
	next.Covers[1].DriveID, next.Covers[1].SHA256 = "new", "sha-new" // replaced by a new upload
	next.Covers[2].SHA256 = "sha-changed"                            // replaced in place
	next.Covers[3].Retired = true                                    // removed
	next.Covers[4].DriveName = "e2.png"                              // renamed
	next.Covers[5].Retired = false                                   // restored
	next.Covers = append(next.Covers, prevCover("sports-badminton-7", "sports", badminton, "fresh", "g.png"))

	changes := diffCatalogs(prev, next)

	for name, got := range map[string][]string{
		"added":    changeKeys(changes.Added),
		"replaced": changeKeys(changes.Replaced),
		"restored": changeKeys(changes.Restored),
		"removed":  changeKeys(changes.Removed),
		"updated":  changeKeys(changes.Updated),
	} {
		want := map[string][]string{
			"added":    {"sports-badminton-7"},
			"replaced": {"sports-badminton-2", "sports-badminton-3"},
			"restored": {"sports-badminton-6"},
			"removed":  {"sports-badminton-4"},
			"updated":  {"sports-badminton-5"},
		}[name]
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("%s = %v, want %v", name, got, want)
		}
	}
	if changes.CategoriesChanged {
		t.Fatal("categories did not change")
	}
	if got, want := changes.headline(), "1 added, 2 replaced, 1 restored, 1 removed, 1 updated"; got != want {
		t.Fatalf("headline = %q, want %q", got, want)
	}
	if got := changes.Removed[0].Path; got != "Sports › Badminton › d.png" {
		t.Fatalf("removed path = %q", got)
	}
}

func TestDiffCatalogsTreatsNewFingerprintsAsUpdates(t *testing.T) {
	// The first sync after this change records fingerprints and Drive names
	// for covers that had none; that is not a replacement.
	before := prevCover("generic-1", "generic", []string{}, "g1", "")
	before.SHA256 = ""
	after := before
	after.DriveName, after.SHA256 = "Group 46.png", "sha-g1"

	changes := diffCatalogs(coverCatalogFile{Covers: []catalogCover{before}}, coverCatalogFile{Covers: []catalogCover{after}})

	if len(changes.Replaced) != 0 || len(changes.Updated) != 1 {
		t.Fatalf("changes = %+v, want one update", changes)
	}
}

func TestCatalogChangesSummary(t *testing.T) {
	changes := catalogChanges{
		Added:   []coverChange{{Key: "food-drinks-brunch-7", Path: "Food & Drinks › Brunch / Food › image 101.png"}},
		Removed: []coverChange{{Key: "food-drinks-brunch-3", Path: "Food & Drinks › Brunch / Food › image 1193.png"}},
	}
	want := "1 added, 1 removed\n" +
		"\n**Added**\n\n- `food-drinks-brunch-7`: Food & Drinks › Brunch / Food › image 101.png\n" +
		"\n**Removed (plans using these now show a similar cover)**\n\n- `food-drinks-brunch-3`: Food & Drinks › Brunch / Food › image 1193.png\n"
	if got := changes.summary(); got != want {
		t.Fatalf("summary =\n%s\nwant\n%s", got, want)
	}
	if got := (catalogChanges{}).summary(); got != "No cover changes\n" {
		t.Fatalf("empty summary = %q", got)
	}
}

func TestCoverPath(t *testing.T) {
	labels := map[string]string{"food-drinks": "Food & Drinks", "generic": "Generic"}
	brunch := catalogCover{Category: "food-drinks", Tags: []string{"Brunch", "Food"}, DriveName: "image 100.png"}
	if got := coverPath(brunch, labels); got != "Food & Drinks › Brunch / Food › image 100.png" {
		t.Fatalf("brunch path = %q", got)
	}
	direct := catalogCover{Category: "generic", Tags: []string{}, FileName: "generic-1.png"}
	if got := coverPath(direct, labels); got != "Generic › generic-1.png" {
		t.Fatalf("direct path = %q", got)
	}
	gone := catalogCover{Category: "old-category", DriveName: "x.png"}
	if got := coverPath(gone, labels); got != "old-category › x.png" {
		t.Fatalf("unknown category path = %q", got)
	}
}

func TestCheckSafety(t *testing.T) {
	active := func(keys ...string) coverCatalogFile {
		var catalog coverCatalogFile
		for _, key := range keys {
			catalog.Covers = append(catalog.Covers, catalogCover{Key: key})
		}
		return catalog
	}
	removed := func(n int) catalogChanges {
		var changes catalogChanges
		for i := 1; i <= n; i++ {
			changes.Removed = append(changes.Removed, coverChange{Key: fmt.Sprintf("generic-%d", i)})
		}
		return changes
	}

	if err := checkSafety(removed(10), active(requiredCoverKey), false); err != nil {
		t.Fatalf("10 removals should be allowed: %v", err)
	}
	err := checkSafety(removed(11), active(requiredCoverKey), false)
	if err == nil || !strings.Contains(err.Error(), "would remove 11 covers") || !strings.Contains(err.Error(), `"Allow removing many covers"`) {
		t.Fatalf("11 removals: error = %v", err)
	}
	if err := checkSafety(removed(11), active(requiredCoverKey), true); err != nil {
		t.Fatalf("allowed removals: %v", err)
	}
	if err := checkSafety(catalogChanges{}, active(), true); err == nil || !strings.Contains(err.Error(), "listed no covers") {
		t.Fatalf("empty Drive: error = %v", err)
	}
	if err := checkSafety(catalogChanges{}, active("generic-1"), false); err == nil || !strings.Contains(err.Error(), requiredCoverKey) {
		t.Fatalf("missing default: error = %v", err)
	}
}
