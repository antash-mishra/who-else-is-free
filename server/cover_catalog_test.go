package main

import "testing"

func TestCoverCatalogLoads(t *testing.T) {
	if len(coverCatalog) == 0 {
		t.Fatal("cover catalog is empty")
	}
	if len(coverCategories) == 0 {
		t.Fatal("cover categories are empty")
	}
}

func TestDefaultCoverKeyIsFirstCatalogCover(t *testing.T) {
	if coverCatalog[0].Key != defaultCoverKey {
		t.Fatalf("first catalog cover %q != defaultCoverKey %q", coverCatalog[0].Key, defaultCoverKey)
	}
	if coverCatalog[0].Category != coverCategories[0].Key {
		t.Fatalf("first cover category %q != first category %q", coverCatalog[0].Category, coverCategories[0].Key)
	}
	if !isValidCoverKey(defaultCoverKey) {
		t.Fatalf("default cover key %q is not valid", defaultCoverKey)
	}
}

func TestLegacyCoverKeysAreInvalid(t *testing.T) {
	for _, legacy := range []string{"badminton", "chess", "wine", "yoga1"} {
		if isValidCoverKey(legacy) {
			t.Fatalf("legacy key %q should no longer be valid", legacy)
		}
	}
}

func TestCoverFileNameForKey(t *testing.T) {
	if got := coverFileNameForKey(defaultCoverKey); got != defaultCoverKey+".png" {
		t.Fatalf("file for default = %q", got)
	}
	if got := coverFileNameForKey("nope"); got != defaultCoverKey+".png" {
		t.Fatalf("fallback file = %q", got)
	}
}

func TestCoverTagsExposed(t *testing.T) {
	foundTagged := false
	foundGeneric := false
	for _, option := range coverCatalog {
		if len(option.Tags) > 1 {
			foundTagged = true
		}
		if option.Category == "generic" && len(option.Tags) == 0 {
			foundGeneric = true
		}
	}
	if !foundTagged || !foundGeneric {
		t.Fatalf("expected multi-tag and generic covers (tagged=%v generic=%v)", foundTagged, foundGeneric)
	}
}
