package main

import (
	"reflect"
	"testing"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Sports":                    "sports",
		"Fitness &amp; Wellness":    "fitness-wellness",
		"Outdoor & Nature":          "outdoor-nature",
		"Hiking / Walk / Mountains": "hiking-walk-mountains",
		" Language Exchange":        "language-exchange",
		"Martial Arts / Ji jitsu":   "martial-arts-ji-jitsu",
	}
	for input, want := range cases {
		if got := slugify(input); got != want {
			t.Fatalf("slugify(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSplitTags(t *testing.T) {
	got := splitTags("Hiking / Walk / Mountains / Forest / Camping")
	want := []string{"Hiking", "Walk", "Mountains", "Forest", "Camping"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("splitTags = %v, want %v", got, want)
	}
	if got := splitTags("Badminton"); !reflect.DeepEqual(got, []string{"Badminton"}) {
		t.Fatalf("single tag = %v", got)
	}
	if got := splitTags("Fitness &amp; Wellness"); !reflect.DeepEqual(got, []string{"Fitness & Wellness"}) {
		t.Fatalf("entity tag = %v", got)
	}
}

func TestParseFolderListing(t *testing.T) {
	html := `<div class="flip-entry" id="entry-AAA111"><a href="https://drive.google.com/drive/folders/AAA111"></a><div class="flip-entry-title">Painting</div></div>` +
		`<div class="flip-entry" id="entry-BBB222"><a href="https://drive.google.com/file/d/BBB222/view"></a><div class="flip-entry-title">image 1181.png</div></div>`
	entries := parseFolderListing(html)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].ID != "AAA111" || !entries[0].IsFolder || entries[0].Title != "Painting" {
		t.Fatalf("folder entry parsed wrong: %+v", entries[0])
	}
	if entries[1].ID != "BBB222" || entries[1].IsFolder || entries[1].Title != "image 1181.png" {
		t.Fatalf("file entry parsed wrong: %+v", entries[1])
	}
}

func TestBuildCatalog(t *testing.T) {
	tree := []driveCategory{
		{
			Title: "Generic",
			Files: []driveEntry{{ID: "g2", Title: "Group 47.png"}, {ID: "g1", Title: "Group 46.png"}},
		},
		{
			Title: "Sports",
			Tags: []driveTagGroup{
				{Title: "Tennis", Files: []driveEntry{{ID: "t1", Title: "Group 79.png"}}},
				{Title: "Badminton", Files: []driveEntry{{ID: "b1", Title: "image 1094.png"}}},
			},
		},
		{
			Title: "Outdoor &amp; Nature",
			Tags: []driveTagGroup{
				{Title: "Hiking / Walk", Files: []driveEntry{{ID: "h1", Title: "image 1134.png"}}},
			},
		},
	}
	catalog := buildCatalog(tree, coverCatalogFile{})

	wantCategories := []catalogCategory{
		{Key: "sports", Label: "Sports"},
		{Key: "outdoor-nature", Label: "Outdoor & Nature"},
		{Key: "generic", Label: "Generic"},
	}
	if !reflect.DeepEqual(catalog.Categories, wantCategories) {
		t.Fatalf("categories = %+v, want %+v", catalog.Categories, wantCategories)
	}

	// Sports first (taxonomy order), Badminton before Tennis (alphabetical tag groups),
	// generic covers last with no tags.
	if catalog.Covers[0].Key != "sports-badminton-1" {
		t.Fatalf("first cover = %q, want sports-badminton-1", catalog.Covers[0].Key)
	}
	if catalog.Covers[0].Label != "Badminton" || catalog.Covers[0].FileName != "sports-badminton-1.png" {
		t.Fatalf("first cover fields wrong: %+v", catalog.Covers[0])
	}
	if catalog.Covers[0].DriveName != "image 1094.png" {
		t.Fatalf("first cover should record its Drive file name: %+v", catalog.Covers[0])
	}
	if catalog.Covers[1].Key != "sports-tennis-1" {
		t.Fatalf("second cover = %q", catalog.Covers[1].Key)
	}
	hiking := catalog.Covers[2]
	if hiking.Key != "outdoor-nature-hiking-1" || !reflect.DeepEqual(hiking.Tags, []string{"Hiking", "Walk"}) {
		t.Fatalf("hiking cover wrong: %+v", hiking)
	}
	// Generic: sorted by title, 1-based keys, empty tags.
	g := catalog.Covers[3:]
	if g[0].Key != "generic-1" || g[0].DriveID != "g1" || len(g[0].Tags) != 0 {
		t.Fatalf("generic-1 wrong: %+v", g[0])
	}
	if g[1].Key != "generic-2" || g[1].DriveID != "g2" {
		t.Fatalf("generic-2 wrong: %+v", g[1])
	}
}

// prevCover is a catalog entry as an earlier sync wrote it.
func prevCover(key, category string, tags []string, driveID, driveName string) catalogCover {
	label := category
	if len(tags) > 0 {
		label = tags[0]
	}
	return catalogCover{
		Key:       key,
		Label:     label,
		FileName:  key + ".png",
		Category:  category,
		Tags:      tags,
		DriveID:   driveID,
		DriveName: driveName,
		SHA256:    "sha-" + driveID,
	}
}

func coverByKey(t *testing.T, catalog coverCatalogFile, key string) catalogCover {
	t.Helper()
	for _, cover := range catalog.Covers {
		if cover.Key == key {
			return cover
		}
	}
	t.Fatalf("no cover %q in %v", key, coverKeys(catalog))
	return catalogCover{}
}

func coverKeys(catalog coverCatalogFile) []string {
	keys := make([]string, len(catalog.Covers))
	for i, cover := range catalog.Covers {
		keys[i] = cover.Key
	}
	return keys
}

func TestBuildCatalogKeepsKeysForRenamedAndMovedFiles(t *testing.T) {
	prev := coverCatalogFile{Covers: []catalogCover{
		prevCover("sports-badminton-1", "sports", []string{"Badminton"}, "b1", "image 1094.png"),
		prevCover("sports-badminton-2", "sports", []string{"Badminton"}, "b2", "image 1095.png"),
	}}
	tree := []driveCategory{{
		Title: "Sports",
		Tags: []driveTagGroup{
			// b1 renamed, a new file that sorts first, and b2 moved to Tennis.
			{Title: "Badminton", Files: []driveEntry{{ID: "b1", Title: "zz smash.png"}, {ID: "b0", Title: "aa serve.png"}}},
			{Title: "Tennis", Files: []driveEntry{{ID: "b2", Title: "image 1095.png"}}},
		},
	}}

	catalog := buildCatalog(tree, prev)

	want := []string{"sports-badminton-3", "sports-badminton-1", "sports-badminton-2"}
	if got := coverKeys(catalog); !reflect.DeepEqual(got, want) {
		t.Fatalf("keys = %v, want %v", got, want)
	}
	if renamed := coverByKey(t, catalog, "sports-badminton-1"); renamed.DriveName != "zz smash.png" {
		t.Fatalf("renamed cover should record its new name: %+v", renamed)
	}
	moved := coverByKey(t, catalog, "sports-badminton-2")
	if moved.Label != "Tennis" || !reflect.DeepEqual(moved.Tags, []string{"Tennis"}) || moved.Retired {
		t.Fatalf("moved cover should follow its folder: %+v", moved)
	}
}

func TestBuildCatalogReplacesByFileNameInTheSameFolder(t *testing.T) {
	prev := coverCatalogFile{Covers: []catalogCover{
		prevCover("fitness-wellness-gym-1", "fitness-wellness", []string{"Gym"}, "old", "Group 78.png"),
	}}
	tree := []driveCategory{{
		Title: "Fitness &amp; Wellness",
		Tags:  []driveTagGroup{{Title: "Gym", Files: []driveEntry{{ID: "new", Title: "group 78.PNG"}}}},
	}}

	catalog := buildCatalog(tree, prev)

	if len(catalog.Covers) != 1 {
		t.Fatalf("covers = %v, want only the replacement", coverKeys(catalog))
	}
	got := catalog.Covers[0]
	if got.Key != "fitness-wellness-gym-1" || got.DriveID != "new" || got.Retired {
		t.Fatalf("replacement should take over the key: %+v", got)
	}
}

func TestBuildCatalogDoesNotReplaceAcrossFolders(t *testing.T) {
	prev := coverCatalogFile{Covers: []catalogCover{
		prevCover("fitness-wellness-gym-1", "fitness-wellness", []string{"Gym"}, "old", "Group 78.png"),
	}}
	tree := []driveCategory{{
		Title: "Fitness &amp; Wellness",
		Tags:  []driveTagGroup{{Title: "Yoga", Files: []driveEntry{{ID: "new", Title: "Group 78.png"}}}},
	}}

	catalog := buildCatalog(tree, prev)

	if got := coverKeys(catalog); !reflect.DeepEqual(got, []string{"fitness-wellness-yoga-1", "fitness-wellness-gym-1"}) {
		t.Fatalf("keys = %v, want a new Yoga cover and Gym retired", got)
	}
	if !catalog.Covers[1].Retired {
		t.Fatalf("gym-1 should be retired: %+v", catalog.Covers[1])
	}
}

func TestBuildCatalogRetiresAndRestoresCovers(t *testing.T) {
	brunch := []string{"Brunch", "Food"}
	prev := coverCatalogFile{Covers: []catalogCover{
		prevCover("food-drinks-brunch-1", "food-drinks", brunch, "x", "image 1192.png"),
		prevCover("food-drinks-brunch-2", "food-drinks", brunch, "y", "image 1193.png"),
	}}
	onlyX := []driveCategory{{
		Title: "Food &amp; Drinks",
		Tags:  []driveTagGroup{{Title: "Brunch / Food", Files: []driveEntry{{ID: "x", Title: "image 1192.png"}}}},
	}}

	removed := buildCatalog(onlyX, prev)
	retired := coverByKey(t, removed, "food-drinks-brunch-2")
	if !retired.Retired || retired.DriveID != "y" || retired.SHA256 != "sha-y" {
		t.Fatalf("removed cover should be retired with its last details: %+v", retired)
	}

	// Restored from Drive's Trash: the file ID comes back.
	both := []driveCategory{{
		Title: "Food &amp; Drinks",
		Tags: []driveTagGroup{{Title: "Brunch / Food", Files: []driveEntry{
			{ID: "x", Title: "image 1192.png"}, {ID: "y", Title: "image 1193.png"},
		}}},
	}}
	restored := buildCatalog(both, removed)
	if got := coverByKey(t, restored, "food-drinks-brunch-2"); got.Retired {
		t.Fatalf("restored cover should be active again: %+v", got)
	}
	if len(restored.Covers) != 2 {
		t.Fatalf("covers = %v, want 2", coverKeys(restored))
	}
}

func TestBuildCatalogNeverReusesRetiredNumbers(t *testing.T) {
	brunch := []string{"Brunch"}
	retired := prevCover("food-drinks-brunch-2", "food-drinks", brunch, "y", "image 1193.png")
	retired.Retired = true
	prev := coverCatalogFile{Covers: []catalogCover{
		prevCover("food-drinks-brunch-1", "food-drinks", brunch, "x", "image 1192.png"),
		retired,
	}}
	tree := []driveCategory{{
		Title: "Food &amp; Drinks",
		Tags: []driveTagGroup{{Title: "Brunch", Files: []driveEntry{
			{ID: "x", Title: "image 1192.png"}, {ID: "z", Title: "image 99.png"},
		}}},
	}}

	catalog := buildCatalog(tree, prev)

	want := []string{"food-drinks-brunch-1", "food-drinks-brunch-3", "food-drinks-brunch-2"}
	if got := coverKeys(catalog); !reflect.DeepEqual(got, want) {
		t.Fatalf("keys = %v, want %v", got, want)
	}
}

func TestBuildCatalogGivesSameNamedNewFilesTheirOwnKeys(t *testing.T) {
	tree := []driveCategory{{
		Title: "Generic",
		Files: []driveEntry{{ID: "a", Title: "Group 46.png"}, {ID: "b", Title: "Group 46.png"}},
	}}

	catalog := buildCatalog(tree, coverCatalogFile{})

	if got := coverKeys(catalog); !reflect.DeepEqual(got, []string{"generic-1", "generic-2"}) {
		t.Fatalf("keys = %v", got)
	}
}

func TestNextCoverKey(t *testing.T) {
	used := map[string]bool{
		"sports-badminton-1": true,
		"sports-badminton-4": true,
		"sports-badminton-x": true,
		"sports-1":           true,
	}
	if got := nextCoverKey("sports-badminton", used); got != "sports-badminton-5" {
		t.Fatalf("next badminton = %q", got)
	}
	if got := nextCoverKey("sports", used); got != "sports-2" {
		t.Fatalf("next sports = %q; keys of other groups must not count", got)
	}
	if got := nextCoverKey("sports-tennis", used); got != "sports-tennis-1" {
		t.Fatalf("next tennis = %q", got)
	}
}
