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
	catalog := buildCatalog(tree)

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
	if catalog.Covers[1].Key != "sports-tennis-1" {
		t.Fatalf("second cover = %q", catalog.Covers[1].Key)
	}
	hiking := catalog.Covers[2]
	if hiking.Key != "outdoor-nature-hiking-1" || !reflect.DeepEqual(hiking.Tags, []string{"Hiking", "Walk"}) {
		t.Fatalf("hiking cover wrong: %+v", hiking)
	}
	// Generic: sorted by title, 1-based keys, empty tags.
	g := catalog.Covers[3:]
	if g[0].Key != "generic-1" || g[0].DriveID() != "g1" || len(g[0].Tags) != 0 {
		t.Fatalf("generic-1 wrong: %+v", g[0])
	}
	if g[1].Key != "generic-2" || g[1].DriveID() != "g2" {
		t.Fatalf("generic-2 wrong: %+v", g[1])
	}
}
