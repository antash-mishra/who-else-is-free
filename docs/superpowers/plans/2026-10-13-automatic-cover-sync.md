# Automatic Cover Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the cover catalog in step with the team Drive folder automatically (twice a day plus a Run workflow button) without ever changing an existing plan's picture by accident.

**Architecture:** `server/cmd/covers-sync` reads the committed catalog before rebuilding it from Drive, so cover keys stay stable (Drive ID, then same name in the same folder, then next unused number); removed covers stay as `retired` entries. The server hides retired covers from `/api/covers` but keeps them valid and serves a similar cover's image at their URL. A scheduled GitHub Actions workflow runs the sync and the server tests, commits the catalog to `master` when it changed, and dispatches the existing Fly deploy.

**Tech Stack:** Go 1.24 (server and sync tool, standard library only), Gin, SQLite (`modernc`), GitHub Actions, bash.

**Spec:** `docs/superpowers/specs/2026-10-13-automatic-cover-sync-design.md`

## Global Constraints

- No new Go dependencies; Go version comes from `server/go.mod` (`go 1.24.0`).
- Drive root folder `1deHHqGMy1DlKpyGoFIHGfRbOQWQuSYO0`, read anonymously (no credentials).
- Keys: `<category>-<first tag>-<n>` or `<category>-<n>`; file name is always `<key>.png`.
- `sports-badminton-1` must stay an active cover.
- Images: PNG only, at most 1 MB (`1 << 20` bytes).
- At most 10 covers retired per run unless `-allow-removals` (workflow input `allow_removals`).
- Schedule `30 3,15 * * *` (09:00 and 21:00 IST).
- No client (`src/`) changes.
- The workflow commits as `github-actions[bot]`; never print secret values.

## Review Focus

- Folder and category names with HTML entities or ` / ` (`Food &amp; Drinks`, `Brunch / Food / …`) must group, number and print the same way they do today. Pinned by the fake-Drive sync test in Task 4 and `TestCoverPath` in Task 3.
- Two files with the same name in one folder (Drive allows it) must get separate keys. Pinned by `TestBuildCatalogGivesSameNamedNewFilesTheirOwnKeys` in Task 1.
- A file uploaded with a vanished cover's name but into a different folder is a new cover, not a replacement. Pinned by `TestBuildCatalogDoesNotReplaceAcrossFolders` in Task 1.
- `master` moving on during a run must not lose either change, and a conflicting catalog edit must fail the run rather than overwrite anything. Pinned by the publish-script harness in Task 7.
- The first sync after this change (catalog without fingerprints) must report updates, not 131 replacements, and keep every key. Pinned by `TestDiffCatalogsTreatsNewFingerprintsAsUpdates` in Task 3 and the real-Drive check in Task 8.

---

### Task 1: Stable cover keys in covers-sync

**Files:**
- Modify: `server/cmd/covers-sync/catalog.go` (catalog types, `buildCatalog`)
- Test: `server/cmd/covers-sync/catalog_test.go`

**Interfaces:**
- Produces: `catalogCover` gains `DriveName string` (`drive_name,omitempty`), `SHA256 string` (`sha256,omitempty`), `Retired bool` (`retired,omitempty`); `func buildCatalog(tree []driveCategory, prev coverCatalogFile) coverCatalogFile`; `func coverGroup(category string, tags []string) string`; `func nextCoverKey(group string, used map[string]bool) string`; test helpers `prevCover`, `coverByKey`, `coverKeys` (in `catalog_test.go`, used by later test files).

- [ ] **Step 1: Write the failing tests**

In `catalog_test.go`, change the existing `TestBuildCatalog` call to `catalog := buildCatalog(tree, coverCatalogFile{})` and add after its first-cover check:

```go
	if catalog.Covers[0].DriveName != "image 1094.png" {
		t.Fatalf("first cover should record its Drive file name: %+v", catalog.Covers[0])
	}
```

Append:

```go
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && go test ./cmd/covers-sync/`
Expected: build failure (`too many arguments in call to buildCatalog`, unknown fields `DriveName`, `SHA256`, `Retired`).

- [ ] **Step 3: Implement**

In `catalog.go`, extend `catalogCover` after `DriveID`:

```go
	// DriveName is the file's name in Drive: a new file with the same name in
	// the same folder as a vanished one takes over its key.
	DriveName string `json:"drive_name,omitempty"`
	// SHA256 fingerprints the image, so a file replaced in place (same Drive
	// ID, new picture) still changes the catalog and gets deployed.
	SHA256 string `json:"sha256,omitempty"`
	// Retired covers were removed from Drive. They stay in the catalog so the
	// key is never reused and plans that use it keep working.
	Retired bool `json:"retired,omitempty"`
```

Replace `buildCatalog` with:

```go
// coverGroup names the Drive folder a cover lives in: the category plus the
// first tag of its tag folder, or just the category for files placed
// directly in it. Keys are "<group>-<n>".
func coverGroup(category string, tags []string) string {
	if len(tags) == 0 {
		return category
	}
	return category + "-" + slugify(tags[0])
}

// listedCover is a Drive file with the catalog fields its location implies.
type listedCover struct {
	file     driveEntry
	group    string
	label    string
	category string
	tags     []string
}

// listDriveCovers flattens the Drive tree in display order: categories in
// taxonomy order; within each, tag folders by name with their files by name,
// then files placed directly in the category.
func listDriveCovers(tree []driveCategory) ([]catalogCategory, []listedCover) {
	categories := make([]driveCategory, len(tree))
	copy(categories, tree)
	sort.SliceStable(categories, func(i, j int) bool {
		si, sj := slugify(categories[i].Title), slugify(categories[j].Title)
		ri, rj := categoryRank(si), categoryRank(sj)
		if ri != rj {
			return ri < rj
		}
		return si < sj
	})

	var outCategories []catalogCategory
	var listed []listedCover
	for _, category := range categories {
		catSlug := slugify(category.Title)
		catLabel := strings.TrimSpace(html.UnescapeString(category.Title))
		outCategories = append(outCategories, catalogCategory{Key: catSlug, Label: catLabel})

		tagGroups := make([]driveTagGroup, len(category.Tags))
		copy(tagGroups, category.Tags)
		sort.SliceStable(tagGroups, func(i, j int) bool {
			return strings.ToLower(strings.TrimSpace(tagGroups[i].Title)) <
				strings.ToLower(strings.TrimSpace(tagGroups[j].Title))
		})
		for _, group := range tagGroups {
			tags := splitTags(group.Title)
			if len(tags) == 0 {
				continue
			}
			files := make([]driveEntry, len(group.Files))
			copy(files, group.Files)
			sortEntries(files)
			for _, file := range files {
				listed = append(listed, listedCover{
					file:     file,
					group:    coverGroup(catSlug, tags),
					label:    tags[0],
					category: catSlug,
					tags:     tags,
				})
			}
		}

		directFiles := make([]driveEntry, len(category.Files))
		copy(directFiles, category.Files)
		sortEntries(directFiles)
		for _, file := range directFiles {
			listed = append(listed, listedCover{
				file:     file,
				group:    catSlug,
				label:    catLabel,
				category: catSlug,
				tags:     []string{},
			})
		}
	}
	return outCategories, listed
}

// buildCatalog lays out the current Drive tree as a catalog without changing
// any key prev already handed out. Each rule runs over every listed file
// before the next one, and a previous cover is matched at most once:
//
//  1. The same Drive file keeps its key, even after a rename or move.
//  2. A new file named like a vanished cover in the same folder takes over its
//     key: a replacement, or a removed cover coming back.
//  3. Anything else gets the next unused number in its folder's group.
//
// Previous covers left unmatched are retired. Active covers get no SHA256;
// the caller fills it in after downloading them.
func buildCatalog(tree []driveCategory, prev coverCatalogFile) coverCatalogFile {
	categories, listed := listDriveCovers(tree)
	keys := make([]string, len(listed))
	claimed := make([]bool, len(prev.Covers))

	byDriveID := make(map[string]int, len(prev.Covers))
	for i, cover := range prev.Covers {
		if _, seen := byDriveID[cover.DriveID]; cover.DriveID != "" && !seen {
			byDriveID[cover.DriveID] = i
		}
	}
	for i, item := range listed {
		if j, ok := byDriveID[item.file.ID]; ok && !claimed[j] {
			keys[i] = prev.Covers[j].Key
			claimed[j] = true
		}
	}

	for i, item := range listed {
		if keys[i] != "" {
			continue
		}
		for j, cover := range prev.Covers {
			if claimed[j] || cover.DriveName == "" {
				continue
			}
			if coverGroup(cover.Category, cover.Tags) == item.group && strings.EqualFold(cover.DriveName, item.file.Title) {
				keys[i] = cover.Key
				claimed[j] = true
				break
			}
		}
	}

	used := make(map[string]bool, len(prev.Covers)+len(listed))
	for _, cover := range prev.Covers {
		used[cover.Key] = true
	}
	for i, item := range listed {
		if keys[i] == "" {
			keys[i] = nextCoverKey(item.group, used)
			used[keys[i]] = true
		}
	}

	out := coverCatalogFile{Categories: categories}
	for i, item := range listed {
		out.Covers = append(out.Covers, catalogCover{
			Key:       keys[i],
			Label:     item.label,
			FileName:  keys[i] + ".png",
			Category:  item.category,
			Tags:      item.tags,
			DriveID:   item.file.ID,
			DriveName: item.file.Title,
		})
	}
	var retired []catalogCover
	for j, cover := range prev.Covers {
		if !claimed[j] {
			cover.Retired = true
			retired = append(retired, cover)
		}
	}
	sort.SliceStable(retired, func(a, b int) bool { return retired[a].Key < retired[b].Key })
	out.Covers = append(out.Covers, retired...)
	return out
}

// nextCoverKey returns "<group>-<n>" with n one above the highest number used
// by any key of that form, retired ones included.
func nextCoverKey(group string, used map[string]bool) string {
	prefix := group + "-"
	highest := 0
	for key := range used {
		rest, ok := strings.CutPrefix(key, prefix)
		if !ok {
			continue
		}
		if n, err := strconv.Atoi(rest); err == nil && n > highest && strconv.Itoa(n) == rest {
			highest = n
		}
	}
	return prefix + strconv.Itoa(highest+1)
}
```

In `main.go`, change the discovery call to `catalog := buildCatalog(tree, coverCatalogFile{})` so the package builds (Task 4 replaces it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && go test ./cmd/covers-sync/`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add server/cmd/covers-sync/catalog.go server/cmd/covers-sync/catalog_test.go server/cmd/covers-sync/main.go
git commit -m "feat(covers-sync): keep cover keys stable across Drive changes"
```

### Task 2: Cover image checks

**Files:**
- Create: `server/cmd/covers-sync/images.go`
- Create: `server/cmd/covers-sync/images_test.go`
- Modify: `server/cmd/covers-sync/main.go` (move `pngMagic` out)

**Interfaces:**
- Produces: `const maxCoverBytes = 1 << 20`; `var pngMagic`; `func checkCoverImage(data []byte) error` (message reads after a Drive path, e.g. `"is a JPEG; covers must be PNG files"`); `func sha256Hex(data []byte) string`; test helper `testPNG(t, shade uint8) []byte`.

- [ ] **Step 1: Write the failing tests** (`images_test.go`)

```go
package main

import (
	"bytes"
	"image"
	"image/png"
	"strings"
	"testing"
)

// testPNG encodes a tiny valid PNG; different shades give different bytes.
func testPNG(t *testing.T, shade uint8) []byte {
	t.Helper()
	img := image.NewGray(image.Rect(0, 0, 2, 2))
	for i := range img.Pix {
		img.Pix[i] = shade
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

func TestCheckCoverImage(t *testing.T) {
	valid := testPNG(t, 10)
	oversized := append(append([]byte{}, valid...), make([]byte, maxCoverBytes)...)
	cases := []struct {
		name string
		data []byte
		want string // part of the error; empty means accepted
	}{
		{"png", valid, ""},
		{"jpeg", []byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 'J', 'F', 'I', 'F'}, "is a JPEG"},
		{"web page", []byte("<!DOCTYPE html><html>"), "is not a PNG file"},
		{"broken png", append(append([]byte{}, pngMagic...), "garbage"...), "is not a readable PNG"},
		{"too large", oversized, "covers must be 1 MB or less"},
	}
	for _, tc := range cases {
		err := checkCoverImage(tc.data)
		if tc.want == "" {
			if err != nil {
				t.Fatalf("%s: unexpected error %v", tc.name, err)
			}
			continue
		}
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Fatalf("%s: error = %v, want it to contain %q", tc.name, err, tc.want)
		}
	}
}

func TestSHA256Hex(t *testing.T) {
	if got := sha256Hex([]byte("abc")); got != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatalf("sha256Hex(abc) = %s", got)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./cmd/covers-sync/ -run 'TestCheckCoverImage|TestSHA256Hex'`
Expected: build failure (`undefined: checkCoverImage`, `maxCoverBytes`, `sha256Hex`).

- [ ] **Step 3: Implement** (`images.go`; delete the `pngMagic` var from `main.go`)

```go
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image/png"
)

// maxCoverBytes keeps covers light on phones: today's 600×600 covers are at
// most ~330 KB, while an accidental full-size export runs to several MB.
const maxCoverBytes = 1 << 20

var (
	pngMagic  = []byte{0x89, 'P', 'N', 'G'}
	jpegMagic = []byte{0xFF, 0xD8, 0xFF}
)

// checkCoverImage explains, for whoever uploaded the file, why data cannot be
// used as a cover; nil means it can. Messages follow the file's Drive path.
func checkCoverImage(data []byte) error {
	switch {
	case bytes.HasPrefix(data, jpegMagic):
		return fmt.Errorf("is a JPEG; covers must be PNG files")
	case !bytes.HasPrefix(data, pngMagic):
		return fmt.Errorf("is not a PNG file")
	}
	if _, err := png.DecodeConfig(bytes.NewReader(data)); err != nil {
		return fmt.Errorf("is not a readable PNG (%v)", err)
	}
	if len(data) > maxCoverBytes {
		return fmt.Errorf("is %.1f MB; covers must be 1 MB or less (export it at 600×600 like the others)", float64(len(data))/(1<<20))
	}
	return nil
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && go test ./cmd/covers-sync/`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add server/cmd/covers-sync/images.go server/cmd/covers-sync/images_test.go server/cmd/covers-sync/main.go
git commit -m "feat(covers-sync): check cover images are PNGs of at most 1 MB"
```

### Task 3: Change summary and safety checks

**Files:**
- Create: `server/cmd/covers-sync/changes.go`
- Create: `server/cmd/covers-sync/changes_test.go`

**Interfaces:**
- Consumes: `catalogCover`, `coverCatalogFile`, `prevCover` (Task 1).
- Produces: `const maxRemovalsPerRun = 10`; `const requiredCoverKey = "sports-badminton-1"`; `type coverChange struct{ Key, Path string }`; `type catalogChanges struct{ Added, Replaced, Restored, Removed, Updated []coverChange; CategoriesChanged bool }`; `func diffCatalogs(prev, next coverCatalogFile) catalogChanges`; `func (c catalogChanges) headline() string`; `func (c catalogChanges) summary() string`; `func categoryLabels(prev, next coverCatalogFile) map[string]string`; `func coverPath(cover catalogCover, labels map[string]string) string`; `func checkSafety(changes catalogChanges, next coverCatalogFile, allowRemovals bool) error`.

- [ ] **Step 1: Write the failing tests** (`changes_test.go`)

```go
package main

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func changeKeys(items []coverChange) []string {
	keys := make([]string, len(items))
	for i, item := range items {
		keys[i] = item.Key
	}
	return keys
}

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
	next.Covers[2].SHA256 = "sha-changed"                              // replaced in place
	next.Covers[3].Retired = true                                      // removed
	next.Covers[4].DriveName = "e2.png"                                // renamed
	next.Covers[5].Retired = false                                     // restored
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./cmd/covers-sync/`
Expected: build failure (`undefined: diffCatalogs`, `catalogChanges`, `coverChange`, `coverPath`, `checkSafety`, `requiredCoverKey`).

- [ ] **Step 3: Implement** (`changes.go`)

```go
package main

import (
	"fmt"
	"reflect"
	"strings"
)

// maxRemovalsPerRun stops a sync that would retire more covers than anyone
// deletes at once: a half-loaded Drive listing looks exactly like that.
const maxRemovalsPerRun = 10

// requiredCoverKey must stay active. The server's defaultCoverKey
// (server/models.go) and the app's DEFAULT_COVER_KEY
// (src/constants/covers.ts) fall back to it.
const requiredCoverKey = "sports-badminton-1"

type coverChange struct {
	Key  string
	Path string // where the file is, or was, in Drive
}

type catalogChanges struct {
	Added    []coverChange
	Replaced []coverChange
	Restored []coverChange
	Removed  []coverChange
	Updated  []coverChange // renamed, moved or relabelled; same picture
	// CategoriesChanged is set when the category list changed.
	CategoriesChanged bool
}

// diffCatalogs lists what a sync changes by comparing the committed catalog
// with the new one.
func diffCatalogs(prev, next coverCatalogFile) catalogChanges {
	labels := categoryLabels(prev, next)
	before := make(map[string]catalogCover, len(prev.Covers))
	for _, cover := range prev.Covers {
		before[cover.Key] = cover
	}
	var changes catalogChanges
	for _, cover := range next.Covers {
		old, existed := before[cover.Key]
		change := coverChange{Key: cover.Key, Path: coverPath(cover, labels)}
		switch {
		case !existed:
			changes.Added = append(changes.Added, change)
		case cover.Retired && !old.Retired:
			change.Path = coverPath(old, labels)
			changes.Removed = append(changes.Removed, change)
		case cover.Retired:
			// Still retired.
		case old.Retired:
			changes.Restored = append(changes.Restored, change)
		case old.DriveID != cover.DriveID || (old.SHA256 != "" && cover.SHA256 != "" && old.SHA256 != cover.SHA256):
			changes.Replaced = append(changes.Replaced, change)
		case !reflect.DeepEqual(old, cover):
			changes.Updated = append(changes.Updated, change)
		}
	}
	changes.CategoriesChanged = !reflect.DeepEqual(prev.Categories, next.Categories)
	return changes
}

// categoryLabels maps category keys to labels. prev fills in categories that
// no longer exist, so removed covers still read well.
func categoryLabels(prev, next coverCatalogFile) map[string]string {
	labels := make(map[string]string, len(prev.Categories)+len(next.Categories))
	for _, catalog := range []coverCatalogFile{prev, next} {
		for _, category := range catalog.Categories {
			labels[category.Key] = category.Label
		}
	}
	return labels
}

// coverPath is where a cover is, or was, in Drive, for people reading the run
// summary: "Food & Drinks › Brunch / Food › image 100.png".
func coverPath(cover catalogCover, labels map[string]string) string {
	parts := []string{cover.Category}
	if label := labels[cover.Category]; label != "" {
		parts[0] = label
	}
	if len(cover.Tags) > 0 {
		parts = append(parts, strings.Join(cover.Tags, " / "))
	}
	name := cover.DriveName
	if name == "" {
		name = cover.FileName
	}
	return strings.Join(append(parts, name), " › ")
}

// headline counts the changes in one line; the workflow uses it as the
// commit subject.
func (c catalogChanges) headline() string {
	var parts []string
	for _, group := range []struct {
		items []coverChange
		verb  string
	}{
		{c.Added, "added"},
		{c.Replaced, "replaced"},
		{c.Restored, "restored"},
		{c.Removed, "removed"},
		{c.Updated, "updated"},
	} {
		if n := len(group.items); n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", n, group.verb))
		}
	}
	if c.CategoriesChanged {
		parts = append(parts, "categories updated")
	}
	if len(parts) == 0 {
		return "No cover changes"
	}
	return strings.Join(parts, ", ")
}

// summary renders the changes as Markdown for the run page and the commit
// message. Its first line is the headline.
func (c catalogChanges) summary() string {
	var b strings.Builder
	b.WriteString(c.headline())
	b.WriteString("\n")
	for _, section := range []struct {
		title string
		items []coverChange
	}{
		{"Added", c.Added},
		{"Replaced (plans using these now show the new picture)", c.Replaced},
		{"Restored", c.Restored},
		{"Removed (plans using these now show a similar cover)", c.Removed},
		{"Updated (renamed or moved; same picture)", c.Updated},
	} {
		if len(section.items) == 0 {
			continue
		}
		fmt.Fprintf(&b, "\n**%s**\n\n", section.title)
		for _, item := range section.items {
			fmt.Fprintf(&b, "- `%s`: %s\n", item.Key, item.Path)
		}
	}
	return b.String()
}

// checkSafety stops a sync whose result looks like a Drive problem rather than
// an edit. It needs no images, so it runs before the downloads.
func checkSafety(changes catalogChanges, next coverCatalogFile, allowRemovals bool) error {
	active := 0
	hasRequired := false
	for _, cover := range next.Covers {
		if cover.Retired {
			continue
		}
		active++
		if cover.Key == requiredCoverKey {
			hasRequired = true
		}
	}
	if active == 0 {
		return fmt.Errorf("the Drive folder listed no covers, which usually means Drive did not load properly. Nothing was changed; the next run will try again")
	}
	if n := len(changes.Removed); n > maxRemovalsPerRun && !allowRemovals {
		return fmt.Errorf("this run would remove %d covers (%s), which usually means Drive did not load properly, so nothing was changed. If you did delete them, run Sync covers from the Actions tab with \"Allow removing many covers\" ticked",
			n, strings.Join(changeKeys(changes.Removed), ", "))
	}
	if !hasRequired {
		return fmt.Errorf("the default cover %s is missing from Drive. The app falls back to it, so restore it (check Drive's Trash), then run Sync covers again. Nothing was changed", requiredCoverKey)
	}
	return nil
}

func changeKeys(items []coverChange) []string {
	keys := make([]string, len(items))
	for i, item := range items {
		keys[i] = item.Key
	}
	return keys
}
```

Remove the `changeKeys` helper from `changes_test.go`; the test uses the production one.

- [ ] **Step 4: Run to verify pass**

Run: `cd server && go test ./cmd/covers-sync/`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add server/cmd/covers-sync/changes.go server/cmd/covers-sync/changes_test.go
git commit -m "feat(covers-sync): summarise catalog changes and stop on suspicious runs"
```

### Task 4: Sync and fetch orchestration

**Files:**
- Modify: `server/cmd/covers-sync/main.go`
- Test: `server/cmd/covers-sync/main_test.go`

**Interfaces:**
- Consumes: `buildCatalog` (Task 1), `checkCoverImage`, `sha256Hex`, `pngMagic` (Task 2), `diffCatalogs`, `checkSafety`, `categoryLabels`, `coverPath` (Task 3).
- Produces: CLI flags `-allow-removals` and `-summary <file>` (used by the workflow in Task 7); `var driveFolderURL, driveDownloadURL string`, `var retryDelay time.Duration`; `type syncOptions struct{ rootID, assetsDir, catalogPath string; allowRemovals bool }`; `func syncCatalog(client *http.Client, opts syncOptions) (string, error)`; `func readCatalog(path string) (coverCatalogFile, error)`; `func writeCatalog(path string, catalog coverCatalogFile) error`; `func localCoverIsCurrent(data []byte, wantSHA256 string) bool`; `func reportFailure(summaryPath string, err error)`; `func escapeAnnotation(message string) string`. On failure the summary file reads `Cover sync stopped\n\n<message>\n`.

- [ ] **Step 1: Write the failing tests** (append to `main_test.go`; add imports `bytes`, `errors`, `fmt`, `html`, `net/http`, `net/http/httptest`, `strings`, `sync`)

```go
// fakeDrive serves Drive's embedded folder pages and file downloads from
// memory, so whole syncs run without the network.
type fakeDrive struct {
	mu        sync.Mutex
	folders   map[string][]driveEntry
	files     map[string][]byte
	downloads map[string]int
}

func (d *fakeDrive) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	id := r.URL.Query().Get("id")
	switch r.URL.Path {
	case "/embeddedfolderview":
		entries, ok := d.folders[id]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		for _, entry := range entries {
			link := "https://drive.google.com/file/d/" + entry.ID + "/view"
			if entry.IsFolder {
				link = "https://drive.google.com/drive/folders/" + entry.ID
			}
			fmt.Fprintf(w, `<div class="flip-entry" id="entry-%s"><a href="%s"></a><div class="flip-entry-title">%s</div></div>`,
				entry.ID, link, html.EscapeString(entry.Title))
		}
	case "/uc":
		data, ok := d.files[id]
		if !ok {
			http.NotFound(w, r)
			return
		}
		d.downloads[id]++
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(data)
	default:
		http.NotFound(w, r)
	}
}

func (d *fakeDrive) downloadCount(id string) int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.downloads[id]
}

func startFakeDrive(t *testing.T, folders map[string][]driveEntry, files map[string][]byte) *fakeDrive {
	t.Helper()
	drive := &fakeDrive{folders: folders, files: files, downloads: map[string]int{}}
	server := httptest.NewServer(drive)
	oldFolderURL, oldDownloadURL, oldDelay := driveFolderURL, driveDownloadURL, retryDelay
	driveFolderURL = server.URL + "/embeddedfolderview?id="
	driveDownloadURL = server.URL + "/uc?export=download&id="
	retryDelay = 0
	t.Cleanup(func() {
		server.Close()
		driveFolderURL, driveDownloadURL, retryDelay = oldFolderURL, oldDownloadURL, oldDelay
	})
	return drive
}

// testDriveFolders is Sports › Badminton plus Food & Drinks › Brunch / Food.
func testDriveFolders(badminton, brunch []driveEntry) map[string][]driveEntry {
	return map[string][]driveEntry{
		"root":          {{ID: "cat-sports", Title: "Sports", IsFolder: true}, {ID: "cat-food", Title: "Food & Drinks", IsFolder: true}},
		"cat-sports":    {{ID: "tag-badminton", Title: "Badminton", IsFolder: true}},
		"tag-badminton": badminton,
		"cat-food":      {{ID: "tag-brunch", Title: "Brunch / Food", IsFolder: true}},
		"tag-brunch":    brunch,
	}
}

var testCategories = []catalogCategory{{Key: "sports", Label: "Sports"}, {Key: "food-drinks", Label: "Food & Drinks"}}

func badmintonCover(image []byte) catalogCover {
	return catalogCover{
		Key: "sports-badminton-1", Label: "Badminton", FileName: "sports-badminton-1.png", Category: "sports",
		Tags: []string{"Badminton"}, DriveID: "bad1", DriveName: "image 1094.png", SHA256: sha256Hex(image),
	}
}

func brunchCover(n int, driveID, driveName, sha string) catalogCover {
	key := fmt.Sprintf("food-drinks-brunch-%d", n)
	return catalogCover{
		Key: key, Label: "Brunch", FileName: key + ".png", Category: "food-drinks",
		Tags: []string{"Brunch", "Food"}, DriveID: driveID, DriveName: driveName, SHA256: sha,
	}
}

func syncPaths(t *testing.T) (catalogPath, assetsDir string) {
	dir := t.TempDir()
	return filepath.Join(dir, "covers_catalog.json"), filepath.Join(dir, "covers")
}

func mustWriteCatalog(t *testing.T, path string, catalog coverCatalogFile) []byte {
	t.Helper()
	if err := writeCatalog(path, catalog); err != nil {
		t.Fatalf("write catalog: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read catalog: %v", err)
	}
	return raw
}

func TestSyncCatalogKeepsKeysAndRecordsChanges(t *testing.T) {
	badminton, brunchOld, brunchNew, extra := testPNG(t, 10), testPNG(t, 20), testPNG(t, 30), testPNG(t, 40)
	catalogPath, assetsDir := syncPaths(t)
	mustWriteCatalog(t, catalogPath, coverCatalogFile{Categories: testCategories, Covers: []catalogCover{
		badmintonCover(badminton),
		brunchCover(1, "brunch1", "image 1192.png", sha256Hex(brunchOld)),
	}})
	// brunch1 was replaced in place (same Drive ID) and a new file sorts before it.
	startFakeDrive(t,
		testDriveFolders(
			[]driveEntry{{ID: "bad1", Title: "image 1094.png"}},
			[]driveEntry{{ID: "brunch1", Title: "image 1192.png"}, {ID: "brunch0", Title: "image 100.png"}},
		),
		map[string][]byte{"bad1": badminton, "brunch1": brunchNew, "brunch0": extra},
	)
	opts := syncOptions{rootID: "root", assetsDir: assetsDir, catalogPath: catalogPath}

	summary, err := syncCatalog(http.DefaultClient, opts)
	if err != nil {
		t.Fatalf("syncCatalog: %v", err)
	}

	got, err := readCatalog(catalogPath)
	if err != nil {
		t.Fatalf("readCatalog: %v", err)
	}
	if keys := coverKeys(got); !reflect.DeepEqual(keys, []string{"sports-badminton-1", "food-drinks-brunch-2", "food-drinks-brunch-1"}) {
		t.Fatalf("keys = %v; the new file must not take brunch-1", keys)
	}
	if sha := coverByKey(t, got, "food-drinks-brunch-1").SHA256; sha != sha256Hex(brunchNew) {
		t.Fatal("brunch-1 should carry the new picture's fingerprint")
	}
	for name, want := range map[string][]byte{
		"sports-badminton-1.png":   badminton,
		"food-drinks-brunch-1.png": brunchNew,
		"food-drinks-brunch-2.png": extra,
	} {
		data, err := os.ReadFile(filepath.Join(assetsDir, name))
		if err != nil || !bytes.Equal(data, want) {
			t.Fatalf("%s on disk is wrong (err %v)", name, err)
		}
	}
	if headline := strings.SplitN(summary, "\n", 2)[0]; headline != "1 added, 1 replaced" {
		t.Fatalf("headline = %q", headline)
	}
	if !strings.Contains(summary, "- `food-drinks-brunch-2`: Food & Drinks › Brunch / Food › image 100.png") {
		t.Fatalf("summary should name the new file:\n%s", summary)
	}

	again, err := syncCatalog(http.DefaultClient, opts)
	if err != nil || again != "No cover changes\n" {
		t.Fatalf("second sync = %q, %v", again, err)
	}
}

func TestSyncCatalogChangesNothingWhenAFileIsNotAPNG(t *testing.T) {
	badminton := testPNG(t, 10)
	catalogPath, assetsDir := syncPaths(t)
	before := mustWriteCatalog(t, catalogPath, coverCatalogFile{Categories: testCategories, Covers: []catalogCover{badmintonCover(badminton)}})
	startFakeDrive(t,
		testDriveFolders(
			[]driveEntry{{ID: "bad1", Title: "image 1094.png"}},
			[]driveEntry{{ID: "photo", Title: "brunch photo.jpg"}},
		),
		map[string][]byte{"bad1": badminton, "photo": {0xFF, 0xD8, 0xFF, 0xE0}},
	)

	_, err := syncCatalog(http.DefaultClient, syncOptions{rootID: "root", assetsDir: assetsDir, catalogPath: catalogPath})

	if err == nil || !strings.Contains(err.Error(), "Food & Drinks › Brunch / Food › brunch photo.jpg is a JPEG") {
		t.Fatalf("error = %v, want it to name the JPEG", err)
	}
	if after, _ := os.ReadFile(catalogPath); !bytes.Equal(before, after) {
		t.Fatal("catalog changed despite the bad file")
	}
	if _, err := os.Stat(assetsDir); !os.IsNotExist(err) {
		t.Fatalf("no images should be written: %v", err)
	}
}

func TestSyncCatalogStopsBeforeRemovingManyCovers(t *testing.T) {
	badminton := testPNG(t, 10)
	catalogPath, assetsDir := syncPaths(t)
	committed := coverCatalogFile{Categories: testCategories, Covers: []catalogCover{badmintonCover(badminton)}}
	for i := 1; i <= 11; i++ {
		committed.Covers = append(committed.Covers, brunchCover(i, fmt.Sprintf("brunch%d", i), fmt.Sprintf("image %d.png", i), "sha"))
	}
	before := mustWriteCatalog(t, catalogPath, committed)
	// The Brunch folder comes back empty, as a half-loaded listing would.
	startFakeDrive(t,
		testDriveFolders([]driveEntry{{ID: "bad1", Title: "image 1094.png"}}, nil),
		map[string][]byte{"bad1": badminton},
	)
	opts := syncOptions{rootID: "root", assetsDir: assetsDir, catalogPath: catalogPath}

	_, err := syncCatalog(http.DefaultClient, opts)
	if err == nil || !strings.Contains(err.Error(), "would remove 11 covers") {
		t.Fatalf("error = %v, want the removal limit", err)
	}
	if after, _ := os.ReadFile(catalogPath); !bytes.Equal(before, after) {
		t.Fatal("catalog changed despite the removal limit")
	}

	opts.allowRemovals = true
	summary, err := syncCatalog(http.DefaultClient, opts)
	if err != nil {
		t.Fatalf("allowed removals: %v", err)
	}
	if headline := strings.SplitN(summary, "\n", 2)[0]; headline != "11 removed" {
		t.Fatalf("headline = %q", headline)
	}
}

func TestFetchFromCatalogRefreshesChangedImages(t *testing.T) {
	current, stale, kept := testPNG(t, 10), testPNG(t, 20), testPNG(t, 30)
	catalogPath, assetsDir := syncPaths(t)
	retired := brunchCover(2, "gone", "image 1193.png", "old")
	retired.Retired = true
	mustWriteCatalog(t, catalogPath, coverCatalogFile{Categories: testCategories, Covers: []catalogCover{
		badmintonCover(current),
		brunchCover(1, "brunch1", "image 1192.png", sha256Hex(kept)),
		retired,
	}})
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string][]byte{
		"sports-badminton-1.png":   stale,
		"food-drinks-brunch-1.png": kept,
		"food-drinks-brunch-2.png": stale,
	} {
		if err := os.WriteFile(filepath.Join(assetsDir, name), data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	drive := startFakeDrive(t, nil, map[string][]byte{"bad1": current, "brunch1": kept})

	if err := fetchFromCatalog(http.DefaultClient, catalogPath, assetsDir); err != nil {
		t.Fatalf("fetchFromCatalog: %v", err)
	}

	if data, _ := os.ReadFile(filepath.Join(assetsDir, "sports-badminton-1.png")); !bytes.Equal(data, current) {
		t.Fatal("a stale image should be downloaded again")
	}
	if n := drive.downloadCount("brunch1"); n != 0 {
		t.Fatalf("an image whose fingerprint matches was downloaded %d times", n)
	}
	if _, err := os.Stat(filepath.Join(assetsDir, "food-drinks-brunch-2.png")); !os.IsNotExist(err) {
		t.Fatalf("a retired cover's image should be pruned: %v", err)
	}
}

func TestFetchFromCatalogKeepsTheDriveVersionWhenFingerprintsDiffer(t *testing.T) {
	newer := testPNG(t, 50)
	catalogPath, assetsDir := syncPaths(t)
	cover := badmintonCover(testPNG(t, 10)) // the catalog still has the old fingerprint
	mustWriteCatalog(t, catalogPath, coverCatalogFile{Categories: testCategories, Covers: []catalogCover{cover}})
	startFakeDrive(t, nil, map[string][]byte{"bad1": newer})

	if err := fetchFromCatalog(http.DefaultClient, catalogPath, assetsDir); err != nil {
		t.Fatalf("a changed Drive file must not fail a deploy: %v", err)
	}
	if data, _ := os.ReadFile(filepath.Join(assetsDir, "sports-badminton-1.png")); !bytes.Equal(data, newer) {
		t.Fatal("fetch should keep what Drive serves")
	}
}

func TestLocalCoverIsCurrent(t *testing.T) {
	image := testPNG(t, 10)
	if !localCoverIsCurrent(image, sha256Hex(image)) {
		t.Fatal("matching fingerprint should be current")
	}
	if localCoverIsCurrent(image, sha256Hex([]byte("other"))) {
		t.Fatal("different fingerprint should not be current")
	}
	if !localCoverIsCurrent(image, "") {
		t.Fatal("a PNG is current when the catalog has no fingerprint")
	}
	if localCoverIsCurrent([]byte("<html>"), "") {
		t.Fatal("a non-PNG is never current")
	}
}

func TestReportFailureWritesSummary(t *testing.T) {
	t.Setenv("GITHUB_ACTIONS", "")
	path := filepath.Join(t.TempDir(), "summary.md")

	reportFailure(path, errors.New("this run would remove 11 covers"))

	data, err := os.ReadFile(path)
	if err != nil || string(data) != "Cover sync stopped\n\nthis run would remove 11 covers\n" {
		t.Fatalf("summary = %q, %v", data, err)
	}
}

func TestEscapeAnnotation(t *testing.T) {
	if got := escapeAnnotation("50% done\nnext\r"); got != "50%25 done%0Anext%0D" {
		t.Fatalf("escapeAnnotation = %q", got)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./cmd/covers-sync/`
Expected: build failure (`undefined: syncCatalog`, `syncOptions`, `readCatalog`, `writeCatalog`, `driveFolderURL`, `retryDelay`, `localCoverIsCurrent`, `reportFailure`, `escapeAnnotation`).

- [ ] **Step 3: Implement** — replace `main.go` with:

```go
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const defaultRootFolderID = "1deHHqGMy1DlKpyGoFIHGfRbOQWQuSYO0"

// Drive endpoints and retry pacing; tests point them at a fake Drive.
var (
	driveFolderURL   = "https://drive.google.com/embeddedfolderview?id="
	driveDownloadURL = "https://drive.google.com/uc?export=download&id="
	retryDelay       = 2 * time.Second
)

func main() {
	root := flag.String("root", defaultRootFolderID, "Drive root folder id")
	assetsDir := flag.String("assets", "assets/covers", "output directory for cover images")
	catalogPath := flag.String("catalog", "covers_catalog.json", "catalog JSON; read first so existing cover keys never change")
	fetch := flag.Bool("fetch", false, "download the images listed in the existing catalog instead of re-discovering Drive (used at deploy time; images are not committed)")
	allowRemovals := flag.Bool("allow-removals", false, fmt.Sprintf("allow one run to remove more than %d covers", maxRemovalsPerRun))
	summaryPath := flag.String("summary", "", "write a Markdown summary of the changes, or of why the sync stopped, to this file")
	flag.Parse()

	client := &http.Client{Timeout: 60 * time.Second}

	if *fetch {
		if err := fetchFromCatalog(client, *catalogPath, *assetsDir); err != nil {
			log.Fatalf("fetch covers from catalog: %v", err)
		}
		return
	}

	summary, err := syncCatalog(client, syncOptions{
		rootID:        *root,
		assetsDir:     *assetsDir,
		catalogPath:   *catalogPath,
		allowRemovals: *allowRemovals,
	})
	if err != nil {
		reportFailure(*summaryPath, err)
		os.Exit(1)
	}
	log.Print(strings.TrimSpace(summary))
	if *summaryPath != "" {
		if err := os.WriteFile(*summaryPath, []byte(summary), 0o644); err != nil {
			log.Fatalf("write summary: %v", err)
		}
	}
}

type syncOptions struct {
	rootID        string
	assetsDir     string
	catalogPath   string
	allowRemovals bool
}

// syncCatalog rebuilds the catalog from Drive, keeping existing keys, and
// returns the change summary. It writes nothing unless every check passes.
func syncCatalog(client *http.Client, opts syncOptions) (string, error) {
	prev, err := readCatalog(opts.catalogPath)
	if err != nil {
		return "", err
	}
	tree, err := fetchTree(client, opts.rootID)
	if err != nil {
		return "", fmt.Errorf("could not list the Drive folder (%v). Nothing was changed; the next run will try again", err)
	}
	next := buildCatalog(tree, prev)
	if err := checkSafety(diffCatalogs(prev, next), next, opts.allowRemovals); err != nil {
		return "", err
	}

	// Download everything to memory first so a failure writes nothing.
	labels := categoryLabels(prev, next)
	images := make(map[string][]byte, len(next.Covers))
	var problems []string
	for i := range next.Covers {
		cover := &next.Covers[i]
		if cover.Retired {
			continue
		}
		data, err := downloadFileWithRetry(client, cover.DriveID)
		if err != nil {
			return "", fmt.Errorf("could not download %s (%v). Nothing was changed; the next run will try again", coverPath(*cover, labels), err)
		}
		if err := checkCoverImage(data); err != nil {
			problems = append(problems, coverPath(*cover, labels)+" "+err.Error())
			continue
		}
		cover.SHA256 = sha256Hex(data)
		images[cover.FileName] = data
		log.Printf("[%d/%d] %s (%d KB)", len(images), len(next.Covers), cover.FileName, len(data)/1024)
	}
	if len(problems) > 0 {
		return "", fmt.Errorf("some files in Drive can't be used as covers, so nothing was changed. Fix or remove them, then run Sync covers again:\n- %s", strings.Join(problems, "\n- "))
	}

	if err := writeImages(opts.assetsDir, images); err != nil {
		return "", err
	}
	if err := writeCatalog(opts.catalogPath, next); err != nil {
		return "", err
	}
	return diffCatalogs(prev, next).summary(), nil
}

// readCatalog loads a catalog file; a missing file reads as an empty catalog.
func readCatalog(path string) (coverCatalogFile, error) {
	var catalog coverCatalogFile
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return catalog, nil
	}
	if err != nil {
		return catalog, fmt.Errorf("read catalog: %w", err)
	}
	if err := json.Unmarshal(raw, &catalog); err != nil {
		return catalog, fmt.Errorf("parse catalog: %w", err)
	}
	return catalog, nil
}

func writeCatalog(path string, catalog coverCatalogFile) error {
	encoded, err := json.MarshalIndent(catalog, "", "  ")
	if err != nil {
		return fmt.Errorf("encode catalog: %w", err)
	}
	if err := os.WriteFile(path, append(encoded, '\n'), 0o644); err != nil {
		return fmt.Errorf("write catalog: %w", err)
	}
	return nil
}

// writeImages saves the cover images and deletes catalog-managed PNGs that no
// active cover uses any more.
func writeImages(assetsDir string, images map[string][]byte) error {
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		return fmt.Errorf("create assets dir: %w", err)
	}
	keep := make(map[string]bool, len(images))
	for fileName, data := range images {
		if err := os.WriteFile(filepath.Join(assetsDir, fileName), data, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", fileName, err)
		}
		keep[fileName] = true
	}
	removed, err := pruneOrphans(assetsDir, keep)
	if err != nil {
		return fmt.Errorf("prune orphans: %w", err)
	}
	for _, name := range removed {
		log.Printf("pruned orphan %s", name)
	}
	log.Printf("wrote %d images to %s", len(images), assetsDir)
	return nil
}

// reportFailure explains why the sync stopped: in the log, as an error
// annotation on the GitHub run page, and in the summary file.
func reportFailure(summaryPath string, err error) {
	log.Printf("cover sync stopped: %v", err)
	if os.Getenv("GITHUB_ACTIONS") == "true" {
		fmt.Printf("::error title=Cover sync stopped::%s\n", escapeAnnotation(err.Error()))
	}
	if summaryPath != "" {
		_ = os.WriteFile(summaryPath, []byte("Cover sync stopped\n\n"+err.Error()+"\n"), 0o644)
	}
}

// escapeAnnotation encodes the characters GitHub workflow commands reserve.
func escapeAnnotation(message string) string {
	return strings.NewReplacer("%", "%25", "\r", "%0D", "\n", "%0A").Replace(message)
}

// fetchFromCatalog downloads every active cover listed in the committed
// catalog into assetsDir, keeping files whose fingerprint still matches. The
// Docker build runs this so the public repo never has to host the images.
func fetchFromCatalog(client *http.Client, catalogPath, assetsDir string) error {
	catalog, err := readCatalog(catalogPath)
	if err != nil {
		return err
	}
	active := 0
	for _, cover := range catalog.Covers {
		if !cover.Retired {
			active++
		}
	}
	if active == 0 {
		return fmt.Errorf("catalog has no active covers")
	}
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		return fmt.Errorf("create assets dir: %w", err)
	}

	keep := make(map[string]bool, active)
	downloaded := 0
	for _, cover := range catalog.Covers {
		if cover.Retired {
			continue // gone from Drive; the server serves a stand-in
		}
		keep[cover.FileName] = true
		if cover.DriveID == "" {
			return fmt.Errorf("cover %s has no drive_id; re-run covers-sync discovery", cover.Key)
		}
		path := filepath.Join(assetsDir, cover.FileName)
		if existing, err := os.ReadFile(path); err == nil && localCoverIsCurrent(existing, cover.SHA256) {
			continue
		}
		data, err := downloadFileWithRetry(client, cover.DriveID)
		if err != nil {
			return fmt.Errorf("download %s (%s): %w", cover.Key, cover.DriveID, err)
		}
		if !bytes.HasPrefix(data, pngMagic) {
			return fmt.Errorf("download %s (%s): not a PNG", cover.Key, cover.DriveID)
		}
		if cover.SHA256 != "" && sha256Hex(data) != cover.SHA256 {
			// Drive changed after the last sync; the next sync records it.
			log.Printf("warning: %s changed in Drive since the last sync; using the Drive version", cover.Key)
		}
		if err := os.WriteFile(path, data, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", cover.FileName, err)
		}
		downloaded++
		log.Printf("fetched %s (%d KB)", cover.FileName, len(data)/1024)
	}

	removed, err := pruneOrphans(assetsDir, keep)
	if err != nil {
		return fmt.Errorf("prune orphans: %w", err)
	}
	for _, name := range removed {
		log.Printf("pruned orphan %s", name)
	}
	log.Printf("fetch complete: %d covers (%d downloaded, %d already present)", active, downloaded, active-downloaded)
	return nil
}

// localCoverIsCurrent reports whether an image already on disk can be kept.
func localCoverIsCurrent(data []byte, wantSHA256 string) bool {
	if wantSHA256 == "" {
		return bytes.HasPrefix(data, pngMagic)
	}
	return sha256Hex(data) == wantSHA256
}
```

Keep `pruneOrphans` and `fetchTree` unchanged, and update the Drive helpers:

```go
func listFolder(client *http.Client, folderID string) ([]driveEntry, error) {
	url := driveFolderURL + folderID
	// ... rest unchanged
}

// downloadFileWithRetry retries transient Drive failures (sporadic 503s show
// up roughly once per full sync) with a short backoff.
func downloadFileWithRetry(client *http.Client, fileID string) ([]byte, error) {
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		data, err := downloadFile(client, fileID)
		if err == nil {
			return data, nil
		}
		lastErr = err
		if attempt < 3 {
			time.Sleep(time.Duration(attempt) * retryDelay)
		}
	}
	return nil, lastErr
}

func downloadFile(client *http.Client, fileID string) ([]byte, error) {
	url := driveDownloadURL + fileID
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}
	if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") {
		return nil, fmt.Errorf("got a Drive web page instead of the file (is it shared publicly?)")
	}
	return io.ReadAll(resp.Body)
}
```

Before relying on the `text/html` check, confirm a real cover download is not served as HTML: `curl -sIL 'https://drive.google.com/uc?export=download&id=1RozohhDuownvNwPeTtMJoEpkiXbfRoBG' | grep -i '^content-type'` must end with a non-HTML type.

- [ ] **Step 4: Run to verify pass**

Run: `cd server && go test ./cmd/covers-sync/ && go vet ./cmd/covers-sync/`
Expected: `ok`, no vet output.

- [ ] **Step 5: Commit**

```bash
git add server/cmd/covers-sync/main.go server/cmd/covers-sync/main_test.go
git commit -m "feat(covers-sync): validate, fingerprint and summarise each sync; refresh stale fetches"
```

### Task 5: Server keeps retired covers valid

**Files:**
- Modify: `server/cover_catalog.go`
- Modify: `server/repository_schema.go:1306-1327` (`ensureValidEventCoverKeys`)
- Modify: `server/api_integration_test.go:332-334`
- Test: `server/cover_catalog_test.go`

**Interfaces:**
- Produces: `type coverIndex struct{ active []CoverOption; categories []CoverCategory; known map[string]bool; standIns map[string]string }`; `var coverCatalog *coverIndex`; `func parseCoverCatalog(data []byte) (*coverIndex, error)`; `func (index *coverIndex) knownKeys() []string`; `func (r *EventRepository) resetUnknownEventCoverKeys(ctx context.Context, keys []string) error`; test helper `mustParseTestCoverCatalog(t) *coverIndex` with fixture `testCoverCatalogJSON` (used by Task 6). `coverFileNameForKey` is deleted (it had no callers).

- [ ] **Step 1: Write the failing tests** — replace `cover_catalog_test.go` with:

```go
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
		"outdoor-nature-1":     defaultCoverKey,         // category gone: default
		"generic-2":            "generic-1",             // placed directly in a category
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
```

In `api_integration_test.go`, replace the first-cover check in "list covers" with:

```go
		hasDefault := false
		for _, option := range payload.Data {
			hasDefault = hasDefault || option.Key == defaultCoverKey
		}
		if !hasDefault {
			t.Fatalf("expected the default cover %q in the list", defaultCoverKey)
		}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test -run 'Cover' .`
Expected: build failure (`coverCatalog.active undefined`, `undefined: resetUnknownEventCoverKeys`).

- [ ] **Step 3: Implement** — replace `cover_catalog.go` with:

```go
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
```

In `repository_schema.go`, replace `ensureValidEventCoverKeys` with:

```go
func (r *EventRepository) ensureValidEventCoverKeys(ctx context.Context) error {
	return r.resetUnknownEventCoverKeys(ctx, coverCatalog.knownKeys())
}

// resetUnknownEventCoverKeys moves plans whose cover key is not in keys to the
// default cover. Covers removed from Drive stay known (the catalog retires
// them), so their plans keep the key and the server serves a stand-in image.
func (r *EventRepository) resetUnknownEventCoverKeys(ctx context.Context, keys []string) error {
	if len(keys) == 0 {
		return nil
	}

	placeholders := make([]string, len(keys))
	args := make([]any, 0, len(keys)+1)
	args = append(args, defaultCoverKey)
	for i, key := range keys {
		placeholders[i] = "?"
		args = append(args, key)
	}

	query := fmt.Sprintf(
		`UPDATE events SET cover_key = ? WHERE TRIM(cover_key) = '' OR cover_key NOT IN (%s);`,
		strings.Join(placeholders, ","),
	)
	if _, err := r.db.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("backfill invalid cover_key values: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && go test . && go vet .`
Expected: `ok`, no vet output.

- [ ] **Step 5: Commit**

```bash
git add server/cover_catalog.go server/cover_catalog_test.go server/repository_schema.go server/api_integration_test.go
git commit -m "feat(server): keep covers removed from Drive valid as retired keys"
```

### Task 6: Serve stand-in images for retired covers

**Files:**
- Create: `server/cover_assets.go`
- Create: `server/cover_assets_test.go`
- Modify: `server/router.go:33`

**Interfaces:**
- Consumes: `coverIndex.standIns`, `mustParseTestCoverCatalog` (Task 5).
- Produces: `func coverAssetHandler(dir string, catalog *coverIndex) gin.HandlerFunc`, mounted at `GET`/`HEAD /assets/covers/:file`.

- [ ] **Step 1: Write the failing test** (`cover_assets_test.go`)

```go
package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCoverAssetHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	for name, body := range map[string]string{
		"sports-badminton-1.png":   "badminton",
		"food-drinks-brunch-1.png": "brunch",
		"generic-1.png":            "generic",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	router := gin.New()
	handler := coverAssetHandler(dir, mustParseTestCoverCatalog(t))
	router.GET("/assets/covers/:file", handler)
	router.HEAD("/assets/covers/:file", handler)

	cases := []struct {
		path   string
		status int
		body   string
	}{
		{"/assets/covers/food-drinks-brunch-1.png", http.StatusOK, "brunch"},
		{"/assets/covers/food-drinks-brunch-2.png", http.StatusOK, "brunch"}, // retired: same folder
		{"/assets/covers/outdoor-nature-1.png", http.StatusOK, "badminton"},  // retired: default
		{"/assets/covers/generic-2.png", http.StatusOK, "generic"},
		{"/assets/covers/food-drinks-coffee-1.png", http.StatusNotFound, ""}, // active, image missing
		{"/assets/covers/no-such-cover-1.png", http.StatusNotFound, ""},
		{"/assets/covers/Sports-Badminton-1.png", http.StatusNotFound, ""},
		{"/assets/covers/sports-badminton-1.jpg", http.StatusNotFound, ""},
		{"/assets/covers/..png", http.StatusNotFound, ""},
	}
	for _, tc := range cases {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rec.Code != tc.status {
			t.Fatalf("GET %s = %d, want %d", tc.path, rec.Code, tc.status)
		}
		if tc.body != "" && rec.Body.String() != tc.body {
			t.Fatalf("GET %s body = %q, want %q", tc.path, rec.Body.String(), tc.body)
		}
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodHead, "/assets/covers/food-drinks-brunch-2.png", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("HEAD for a retired cover = %d, want 200", rec.Code)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test -run TestCoverAssetHandler .`
Expected: build failure (`undefined: coverAssetHandler`).

- [ ] **Step 3: Implement** (`cover_assets.go`)

```go
package main

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

var coverAssetNamePattern = regexp.MustCompile(`^[a-z0-9-]+\.png$`)

// coverAssetHandler serves catalog cover images from dir. A cover removed from
// Drive has no image any more, so its URL serves its stand-in's image: plans,
// chats and notifications that still use the key keep a similar picture.
func coverAssetHandler(dir string, catalog *coverIndex) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := c.Param("file")
		if !coverAssetNamePattern.MatchString(name) {
			c.Status(http.StatusNotFound)
			return
		}
		path := filepath.Join(dir, name)
		if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
			c.File(path)
			return
		}
		if standIn, ok := catalog.standIns[strings.TrimSuffix(name, ".png")]; ok {
			c.File(filepath.Join(dir, standIn+".png"))
			return
		}
		c.Status(http.StatusNotFound)
	}
}
```

In `router.go`, replace `r.Static("/assets/covers", coverAssetsDir())` with:

```go
	coverAssets := coverAssetHandler(coverAssetsDir(), coverCatalog)
	r.GET("/assets/covers/:file", coverAssets)
	r.HEAD("/assets/covers/:file", coverAssets)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd server && go test . && go vet .`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add server/cover_assets.go server/cover_assets_test.go server/router.go
git commit -m "feat(server): serve a similar cover's image for retired cover keys"
```

### Task 7: Scheduled sync workflow

**Files:**
- Create: `.github/workflows/sync-covers.yml`
- Create: `.github/scripts/publish-cover-catalog.sh` (executable)
- Scratch only: a harness that exercises the script against a local bare repository

**Interfaces:**
- Consumes: `covers-sync -summary <file> [-allow-removals]` (Task 4); summary line 1 is the headline.
- Produces: the **Sync covers** workflow with input `allow_removals`.

- [ ] **Step 1: Write the publish script**

```bash
#!/usr/bin/env bash
# Commits server/covers_catalog.json to master when the sync changed it, then
# starts the Fly deploy: pushes made with GITHUB_TOKEN don't trigger
# deploy-fly.yml on their own.
# Usage: publish-cover-catalog.sh <summary.md>
set -euo pipefail

summary="$1"
catalog="server/covers_catalog.json"

if git diff --quiet -- "$catalog"; then
  echo "No cover changes to publish."
  exit 0
fi

git config user.name 'github-actions[bot]'
git config user.email '41898283+github-actions[bot]@users.noreply.github.com'
git add -- "$catalog"
{
  printf 'chore(covers): sync from Drive (%s)\n' "$(head -n 1 "$summary")"
  tail -n +2 "$summary"
} | git commit --quiet --file=-

for attempt in 1 2 3; do
  if git push origin HEAD:master; then
    gh workflow run deploy-fly.yml --ref master
    echo "Pushed the cover catalog and started the Fly deploy."
    exit 0
  fi
  # master moved on during the run. A conflicting change to the catalog stops
  # here (set -e) and the next run starts fresh.
  echo "master moved on; rebasing (attempt $attempt)."
  git pull --rebase origin master
done
echo "::error::Could not push the cover catalog to master."
exit 1
```

- [ ] **Step 2: Exercise it against a local bare repository** (scratch harness; `gh` stubbed on `PATH`): (a) unchanged catalog → exits 0, no commit; (b) changed catalog → one commit whose subject is `chore(covers): sync from Drive (1 added)`, pushed, `gh workflow run deploy-fly.yml --ref master` called; (c) `master` gained an unrelated commit after checkout → push rejected, rebase, push succeeds, both commits on `master`; (d) `master` changed the catalog after checkout → exits non-zero and nothing new is pushed.

- [ ] **Step 3: Write the workflow**

```yaml
name: Sync covers

# Keeps the cover catalog in step with the team Drive folder. When covers were
# added, replaced or removed it commits server/covers_catalog.json to master
# and starts the Fly deploy.
on:
  schedule:
    # 09:00 and 21:00 IST (UTC+5:30)
    - cron: '30 3,15 * * *'
  workflow_dispatch:
    inputs:
      allow_removals:
        description: Allow removing many covers (more than 10 in one run)
        type: boolean
        default: false

concurrency:
  group: covers-sync
  cancel-in-progress: false

permissions:
  contents: write
  actions: write

jobs:
  sync:
    name: Sync covers from Drive
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version-file: server/go.mod
          cache-dependency-path: server/go.sum

      - name: Sync catalog from Drive
        working-directory: server
        env:
          ALLOW_REMOVALS: ${{ inputs.allow_removals }}
        run: |
          args=(-summary "$RUNNER_TEMP/covers-summary.md")
          if [ "$ALLOW_REMOVALS" = "true" ]; then
            args+=(-allow-removals)
          fi
          go run ./cmd/covers-sync "${args[@]}"

      - name: Show summary
        if: always()
        run: |
          if [ -f "$RUNNER_TEMP/covers-summary.md" ]; then
            cat "$RUNNER_TEMP/covers-summary.md" >> "$GITHUB_STEP_SUMMARY"
          fi

      - name: Test the server with the new catalog
        working-directory: server
        run: go test ./...

      - name: Commit and deploy
        env:
          GH_TOKEN: ${{ github.token }}
        run: .github/scripts/publish-cover-catalog.sh "$RUNNER_TEMP/covers-summary.md"
```

- [ ] **Step 4: Lint**

Run: `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/sync-covers.yml`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
chmod +x .github/scripts/publish-cover-catalog.sh
git add .github/workflows/sync-covers.yml .github/scripts/publish-cover-catalog.sh
git commit -m "ci: sync covers from Drive twice a day and on demand"
```

### Task 8: One-time catalog update against the real Drive

**Files:**
- Modify: `server/covers_catalog.json` (generated)

- [ ] **Step 1: Run the new sync**

Run: `cd server && go run ./cmd/covers-sync -summary "$SCRATCH/first-sync.md"`
Expected: exits 0; `head -1 "$SCRATCH/first-sync.md"` is `131 updated` unless Drive changed since PR #198.

- [ ] **Step 2: Prove no key or Drive ID moved**

```bash
diff <(git show HEAD:server/covers_catalog.json | jq -r '.covers[] | "\(.key) \(.drive_id)"' | sort) \
     <(jq -r '.covers[] | "\(.key) \(.drive_id)"' covers_catalog.json | sort) && echo "keys and Drive IDs unchanged"
jq '[.covers[] | select(.sha256 == null or .drive_name == null or .retired == true)] | length' covers_catalog.json
```
Expected: `keys and Drive IDs unchanged`, then `0`.

- [ ] **Step 3: Second run is a no-op**

Run: `go run ./cmd/covers-sync -summary "$SCRATCH/second-sync.md" && head -1 "$SCRATCH/second-sync.md" && git diff --stat`
Expected: `No cover changes`; the diff still shows only the first run's catalog change.

- [ ] **Step 4: Reproduce the deploy download**

Run: `go run ./cmd/covers-sync -fetch -assets "$SCRATCH/fetch-check" -catalog covers_catalog.json`
Expected: `fetch complete: 131 covers (131 downloaded, 0 already present)` and no `warning:` lines.

- [ ] **Step 5: Full server tests, then commit**

Run: `go test ./...` (expected `ok` for every package), then:

```bash
git add server/covers_catalog.json
git commit -m "chore(covers): record Drive file names and fingerprints in the catalog"
```

### Task 9: Docs, final checks and PR

**Files:**
- Modify: `AGENTS.md` (cover catalog bullet), `CLAUDE.md` (cover catalog bullet)

- [ ] **Step 1: Replace the AGENTS.md cover catalog bullet** with the new rules: the workflow (schedule, button, direct commit, dispatched deploy), stable keys (Drive ID, then same name in the same folder, then next number), retired covers (hidden, still valid, kept by `ensureValidEventCoverKeys`, stand-in image), fingerprints, PNG ≤ 1 MB, the 10-removal limit and `allow_removals`, `sports-badminton-1` must stay, dry runs need a copy of the catalog, `-fetch` refreshes stale local files. Mirror the essentials in `CLAUDE.md`.
- [ ] **Step 2: Run** `cd server && gofmt -l . && go vet ./... && go test ./...` — expected: no gofmt output, `ok` everywhere.
- [ ] **Step 3: Whole-branch review** by a fresh reviewer; fix what it confirms.
- [ ] **Step 4: Commit docs, push the branch, open the PR** describing the behaviour, the one-time catalog update, the post-merge check (press Run workflow, expect no changes; add a real cover) and the known limits.
