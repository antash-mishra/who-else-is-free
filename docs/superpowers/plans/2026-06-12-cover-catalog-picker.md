# Cover Catalog & Choose-Cover Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 26-cover hardcoded catalog with a ~130-image categorized/tagged catalog synced from Google Drive, and rebuild the Choose Cover overlay (search + category chips + 3-column grid) per Figma.

**Architecture:** A standalone Go tool (`server/cmd/covers-sync`) downloads the public Drive folder tree into `server/assets/covers/` and generates `server/covers_catalog.json`, which the server embeds (`go:embed`) to serve `GET /api/covers` (now with `category`, `tags`, and a `categories` list). The React Native app keeps its CoversContext flow; a new pure `searchCovers` helper implements tag/category search with Generic covers appended to every result set; `CoverPickerContent` is rebuilt to the new design inside the existing Create/Edit Event bottom-sheet system.

**Tech Stack:** Go (Gin, go:embed), React Native Expo (FlatList, expo-image), Jest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-12-cover-catalog-picker-design.md`
**Figma reference:** `report/cover-picker-figma-design.png`

**Key constants:**
- Drive root folder ID: `1deHHqGMy1DlKpyGoFIHGfRbOQWQuSYO0`
- New default cover key: `sports-badminton-1` (first category Sports → first tag group Badminton → first image)
- Category display order: sports, fitness-wellness, outdoor-nature, social, entertainment, food-drinks, travel-adventure, creative, then unknown categories alphabetically, generic always last.

---

### Task 1: Drive sync tool — pure helpers (TDD)

**Files:**
- Create: `server/cmd/covers-sync/catalog.go`
- Create: `server/cmd/covers-sync/catalog_test.go`

- [ ] **Step 1: Write the failing tests**

`server/cmd/covers-sync/catalog_test.go`:

```go
package main

import (
	"reflect"
	"testing"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Sports":                       "sports",
		"Fitness &amp; Wellness":       "fitness-wellness",
		"Outdoor & Nature":             "outdoor-nature",
		"Hiking / Walk / Mountains":    "hiking-walk-mountains",
		" Language Exchange":           "language-exchange",
		"Martial Arts / Ji jitsu":      "martial-arts-ji-jitsu",
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && go test ./cmd/covers-sync/`
Expected: FAIL (undefined: slugify, splitTags, ...)

- [ ] **Step 3: Implement the helpers**

`server/cmd/covers-sync/catalog.go`:

```go
package main

import (
	"html"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type driveEntry struct {
	ID       string
	Title    string
	IsFolder bool
}

type driveTagGroup struct {
	Title string
	Files []driveEntry
}

type driveCategory struct {
	Title string
	Tags  []driveTagGroup
	Files []driveEntry // direct images (Generic)
}

type catalogCategory struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type catalogCover struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	FileName string   `json:"file_name"`
	Category string   `json:"category"`
	Tags     []string `json:"tags"`
	driveID  string
}

// DriveID exposes the unexported source-file id (kept out of the JSON output).
func (c catalogCover) DriveID() string { return c.driveID }

type coverCatalogFile struct {
	Categories []catalogCategory `json:"categories"`
	Covers     []catalogCover    `json:"covers"`
}

const genericCategoryKey = "generic"

// Display order from the Figma taxonomy; unknown categories follow alphabetically,
// generic is always last.
var categoryOrder = []string{
	"sports",
	"fitness-wellness",
	"outdoor-nature",
	"social",
	"entertainment",
	"food-drinks",
	"travel-adventure",
	"creative",
}

var (
	entryPattern    = regexp.MustCompile(`(?s)id="entry-([^"]+)"(.*?)flip-entry-title">([^<]+)<`)
	nonAlnumPattern = regexp.MustCompile(`[^a-z0-9]+`)
)

func slugify(value string) string {
	lowered := strings.ToLower(html.UnescapeString(value))
	return strings.Trim(nonAlnumPattern.ReplaceAllString(lowered, "-"), "-")
}

func splitTags(folderName string) []string {
	parts := strings.Split(html.UnescapeString(folderName), "/")
	tags := make([]string, 0, len(parts))
	for _, part := range parts {
		if tag := strings.TrimSpace(part); tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

func parseFolderListing(pageHTML string) []driveEntry {
	matches := entryPattern.FindAllStringSubmatch(pageHTML, -1)
	entries := make([]driveEntry, 0, len(matches))
	for _, match := range matches {
		entries = append(entries, driveEntry{
			ID:       match[1],
			Title:    strings.TrimSpace(html.UnescapeString(match[3])),
			IsFolder: strings.Contains(match[2], "/drive/folders/"),
		})
	}
	return entries
}

func categoryRank(slug string) int {
	for i, known := range categoryOrder {
		if known == slug {
			return i
		}
	}
	if slug == genericCategoryKey {
		return len(categoryOrder) + 1
	}
	return len(categoryOrder)
}

func sortEntries(entries []driveEntry) {
	sort.SliceStable(entries, func(i, j int) bool {
		return strings.ToLower(entries[i].Title) < strings.ToLower(entries[j].Title)
	})
}

func buildCatalog(tree []driveCategory) coverCatalogFile {
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

	out := coverCatalogFile{}
	for _, category := range categories {
		catSlug := slugify(category.Title)
		out.Categories = append(out.Categories, catalogCategory{
			Key:   catSlug,
			Label: strings.TrimSpace(html.UnescapeString(category.Title)),
		})

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
			tagSlug := slugify(tags[0])
			for i, file := range files {
				key := catSlug + "-" + tagSlug + "-" + strconv.Itoa(i+1)
				out.Covers = append(out.Covers, catalogCover{
					Key:      key,
					Label:    tags[0],
					FileName: key + ".png",
					Category: catSlug,
					Tags:     tags,
					driveID:  file.ID,
				})
			}
		}

		directFiles := make([]driveEntry, len(category.Files))
		copy(directFiles, category.Files)
		sortEntries(directFiles)
		for i, file := range directFiles {
			key := catSlug + "-" + strconv.Itoa(i+1)
			out.Covers = append(out.Covers, catalogCover{
				Key:      key,
				Label:    strings.TrimSpace(html.UnescapeString(category.Title)),
				FileName: key + ".png",
				Category: catSlug,
				Tags:     []string{},
				driveID:  file.ID,
			})
		}
	}
	return out
}

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && go test ./cmd/covers-sync/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/cmd/covers-sync/
git commit -m "feat(server): add covers-sync catalog helpers"
```

---

### Task 2: Drive sync tool — main (network IO) and catalog generation

**Files:**
- Create: `server/cmd/covers-sync/main.go`
- Generate: `server/covers_catalog.json`, `server/assets/covers/*.png` (130 new files)
- Delete: the 26 legacy `server/assets/covers/*.png`

- [ ] **Step 1: Write main.go**

```go
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const defaultRootFolderID = "1deHHqGMy1DlKpyGoFIHGfRbOQWQuSYO0"

var pngMagic = []byte{0x89, 'P', 'N', 'G'}

func main() {
	root := flag.String("root", defaultRootFolderID, "Drive root folder id")
	assetsDir := flag.String("assets", "assets/covers", "output directory for cover images")
	catalogPath := flag.String("catalog", "covers_catalog.json", "output path for catalog JSON")
	flag.Parse()

	client := &http.Client{Timeout: 60 * time.Second}

	tree, err := fetchTree(client, *root)
	if err != nil {
		log.Fatalf("enumerate drive folder: %v", err)
	}
	catalog := buildCatalog(tree)
	log.Printf("catalog: %d categories, %d covers", len(catalog.Categories), len(catalog.Covers))

	if err := os.MkdirAll(*assetsDir, 0o755); err != nil {
		log.Fatalf("create assets dir: %v", err)
	}

	// Download everything to memory first so a partial failure writes nothing.
	images := make(map[string][]byte, len(catalog.Covers))
	for i, cover := range catalog.Covers {
		data, err := downloadFile(client, cover.DriveID())
		if err != nil {
			log.Fatalf("download %s (%s): %v", cover.Key, cover.DriveID(), err)
		}
		images[cover.FileName] = data
		log.Printf("[%d/%d] %s (%d KB)", i+1, len(catalog.Covers), cover.FileName, len(data)/1024)
	}

	for fileName, data := range images {
		if err := os.WriteFile(filepath.Join(*assetsDir, fileName), data, 0o644); err != nil {
			log.Fatalf("write %s: %v", fileName, err)
		}
	}

	encoded, err := json.MarshalIndent(catalog, "", "  ")
	if err != nil {
		log.Fatalf("encode catalog: %v", err)
	}
	if err := os.WriteFile(*catalogPath, append(encoded, '\n'), 0o644); err != nil {
		log.Fatalf("write catalog: %v", err)
	}
	log.Printf("wrote %s and %d images to %s", *catalogPath, len(images), *assetsDir)
}

func fetchTree(client *http.Client, rootID string) ([]driveCategory, error) {
	rootEntries, err := listFolder(client, rootID)
	if err != nil {
		return nil, err
	}
	var tree []driveCategory
	for _, categoryEntry := range rootEntries {
		if !categoryEntry.IsFolder {
			continue // stray files at the root are not part of the catalog
		}
		category := driveCategory{Title: categoryEntry.Title}
		children, err := listFolder(client, categoryEntry.ID)
		if err != nil {
			return nil, fmt.Errorf("list category %q: %w", categoryEntry.Title, err)
		}
		for _, child := range children {
			if child.IsFolder {
				files, err := listFolder(client, child.ID)
				if err != nil {
					return nil, fmt.Errorf("list tag folder %q: %w", child.Title, err)
				}
				group := driveTagGroup{Title: child.Title}
				for _, file := range files {
					if !file.IsFolder {
						group.Files = append(group.Files, file)
					}
				}
				category.Tags = append(category.Tags, group)
			} else {
				category.Files = append(category.Files, child)
			}
		}
		tree = append(tree, category)
	}
	return tree, nil
}

func listFolder(client *http.Client, folderID string) ([]driveEntry, error) {
	url := "https://drive.google.com/embeddedfolderview?id=" + folderID
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return parseFolderListing(string(body)), nil
}

func downloadFile(client *http.Client, fileID string) ([]byte, error) {
	url := "https://drive.google.com/uc?export=download&id=" + fileID
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if !bytes.HasPrefix(data, pngMagic) {
		return nil, fmt.Errorf("not a PNG (got %d bytes, possibly a Drive interstitial page)", len(data))
	}
	return data, nil
}
```

- [ ] **Step 2: Build and vet**

Run: `cd server && go vet ./cmd/covers-sync/ && go build ./cmd/covers-sync/`
Expected: clean build (delete the stray `covers-sync` binary if created: `rm -f covers-sync`)

- [ ] **Step 3: Remove legacy covers, then run the sync**

```bash
cd server
git rm -q assets/covers/*.png
go run ./cmd/covers-sync
```

Expected output: `catalog: 9 categories, 130 covers` then per-file download logs, ending with `wrote covers_catalog.json and 130 images to assets/covers`.

- [ ] **Step 4: Verify the output**

```bash
ls server/assets/covers | wc -l          # expect 130
head -c 400 server/covers_catalog.json   # categories start with sports
python3 -c "import json; c = json.load(open('server/covers_catalog.json')); print(c['covers'][0]['key']); print(len(c['covers']))"
```

Expected: first cover key `sports-badminton-1`, 130 covers. All files PNG (`file server/assets/covers/* | grep -cv PNG` → 0... note `grep -cv` counts non-matching lines, expect `0`).

- [ ] **Step 5: Commit**

```bash
git add server/assets/covers server/covers_catalog.json server/cmd/covers-sync
git commit -m "feat(server): sync 130 categorized covers from Drive"
```

---

### Task 3: Backend — embedded catalog, default key, schema literals

**Files:**
- Modify: `server/cover_catalog.go` (full rewrite below)
- Modify: `server/models.go:5` (`defaultCoverKey`)
- Modify: `server/handler.go:69-76` (`listCovers`)
- Modify: `server/repository_schema.go:51` and `:876` (schema default literals)
- Create: `server/cover_catalog_test.go`

- [ ] **Step 1: Write the failing tests**

`server/cover_catalog_test.go`:

```go
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && go test -run 'TestCover|TestDefault|TestLegacy' ./...`
Expected: FAIL (coverCategories undefined; legacy keys still valid)

- [ ] **Step 3: Rewrite `server/cover_catalog.go`**

```go
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
```

- [ ] **Step 4: Update the default key and schema literals**

`server/models.go:5`:

```go
const defaultCoverKey = "sports-badminton-1"
```

`server/repository_schema.go:51` (CREATE TABLE):

```sql
cover_key TEXT NOT NULL DEFAULT 'sports-badminton-1',
```

`server/repository_schema.go:876` (ALTER TABLE in ensureEventCoverKeyColumn):

```go
if _, err := r.db.ExecContext(ctx, `ALTER TABLE events ADD COLUMN cover_key TEXT NOT NULL DEFAULT 'sports-badminton-1';`); err != nil {
```

(`ensureValidEventCoverKeys` needs no change — it already remaps any key not in `listCoverOptions()` to `defaultCoverKey`, which now covers all 26 legacy keys.)

- [ ] **Step 5: Extend `listCovers` (handler.go:69-76)**

```go
func (h *EventHandler) listCovers(c *gin.Context) {
	options := listCoverOptions()
	baseURL := requestBaseURL(c)
	for i := range options {
		options[i].URL = baseURL + "/assets/covers/" + options[i].FileName
	}
	c.JSON(http.StatusOK, gin.H{
		"data":       options,
		"categories": listCoverCategories(),
	})
}
```

- [ ] **Step 6: Run the full backend test suite**

Run: `cd server && go test ./...`
Expected: PASS. The existing integration assertion (`api_integration_test.go:330` — first cover equals `defaultCoverKey`) passes because the catalog's first cover IS the default. If any test still references a legacy key literal (e.g. `"badminton"`), update it to `defaultCoverKey`.

- [ ] **Step 7: Commit**

```bash
git add server/cover_catalog.go server/cover_catalog_test.go server/models.go server/handler.go server/repository_schema.go
git commit -m "feat(server): serve categorized cover catalog from embedded JSON"
```

---

### Task 4: Frontend data layer — covers constants, search helper, context

**Files:**
- Modify: `src/constants/covers.ts`
- Create: `src/utils/coverSearch.ts`
- Create: `src/utils/__tests__/coverSearch.test.ts`
- Modify: `src/context/CoversContext.tsx`

- [ ] **Step 1: Write the failing search tests**

`src/utils/__tests__/coverSearch.test.ts`:

```ts
import { CoverCategory, CoverOption } from '@constants/covers';
import { searchCovers } from '@utils/coverSearch';

const cover = (
  key: string,
  category: string,
  tags: string[],
): CoverOption => ({
  key,
  label: tags[0] ?? category,
  fileName: `${key}.png`,
  url: `https://x/${key}.png`,
  source: { uri: `https://x/${key}.png` },
  category,
  tags,
});

const categories: CoverCategory[] = [
  { key: 'sports', label: 'Sports' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'generic', label: 'Generic' },
];

const covers: CoverOption[] = [
  cover('sports-badminton-1', 'sports', ['Badminton']),
  cover('entertainment-concerts-1', 'entertainment', [
    'Concerts',
    'Festivals',
    'Party',
    'Dancing',
  ]),
  cover('generic-1', 'generic', []),
  cover('generic-2', 'generic', []),
];

describe('searchCovers', () => {
  it('returns all covers in catalog order with no query or category', () => {
    const result = searchCovers(covers, categories, {});
    expect(result.map((c) => c.key)).toEqual([
      'sports-badminton-1',
      'entertainment-concerts-1',
      'generic-1',
      'generic-2',
    ]);
  });

  it('matches individual tag segments case-insensitively', () => {
    const result = searchCovers(covers, categories, { query: 'party' });
    expect(result.map((c) => c.key)).toEqual([
      'entertainment-concerts-1',
      'generic-1',
      'generic-2',
    ]);
  });

  it('matches category labels', () => {
    const result = searchCovers(covers, categories, { query: 'sport' });
    expect(result.map((c) => c.key)).toEqual([
      'sports-badminton-1',
      'generic-1',
      'generic-2',
    ]);
  });

  it('appends generic covers even when nothing matches', () => {
    const result = searchCovers(covers, categories, { query: 'zzz-no-match' });
    expect(result.map((c) => c.key)).toEqual(['generic-1', 'generic-2']);
  });

  it('filters by selected category and appends generic', () => {
    const result = searchCovers(covers, categories, { categoryKey: 'sports' });
    expect(result.map((c) => c.key)).toEqual([
      'sports-badminton-1',
      'generic-1',
      'generic-2',
    ]);
  });

  it('does not duplicate generic covers', () => {
    const result = searchCovers(covers, categories, { query: 'generic' });
    const genericCount = result.filter((c) => c.key.startsWith('generic')).length;
    expect(genericCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/utils/__tests__/coverSearch.test.ts --runInBand --silent`
Expected: FAIL (module not found / type errors)

- [ ] **Step 3: Extend `src/constants/covers.ts`**

Apply these changes (keep the rest of the file as-is):

```ts
export type CoverOption = {
  key: CoverKey;
  label: string;
  fileName: string;
  url: string;
  source: ImageSourcePropType;
  category: string;
  tags: string[];
};

export type ApiCoverOption = {
  key: string;
  label: string;
  file_name?: string;
  url?: string;
  category?: string;
  tags?: string[];
};

export type CoverCategory = {
  key: string;
  label: string;
};

export type ApiCoverCategory = {
  key?: string;
  label?: string;
};

export const GENERIC_COVER_CATEGORY = "generic";

export const DEFAULT_COVER_KEY: CoverKey = "sports-badminton-1";

// (coverAssetUrl unchanged)

export const DEFAULT_EVENT_IMAGE = coverAssetUrl("sports-badminton-1.png");

export const DEFAULT_COVER_OPTION: CoverOption = {
  key: DEFAULT_COVER_KEY,
  label: "Badminton",
  fileName: "sports-badminton-1.png",
  url: DEFAULT_EVENT_IMAGE,
  source: { uri: DEFAULT_EVENT_IMAGE },
  category: "sports",
  tags: ["Badminton"],
};

export const mapApiCoverOption = (option: ApiCoverOption): CoverOption => {
  const fileName = option.file_name ?? `${option.key}.png`;
  const url = normalizeCoverUrl(option.url, fileName);
  return {
    key: option.key,
    label: option.label,
    fileName,
    url,
    source: { uri: url },
    category: option.category ?? GENERIC_COVER_CATEGORY,
    tags: Array.isArray(option.tags) ? option.tags : [],
  };
};

export const mapApiCoverCategory = (
  category: ApiCoverCategory,
): CoverCategory | null => {
  const key = category.key?.trim();
  if (!key) {
    return null;
  }
  return { key, label: category.label?.trim() || key };
};
```

Also DELETE the dead exports `COVER_GRADIENTS` and `resolveCoverGradient` (no usages outside this file — verified 2026-06-12) and the gradient hexes with them. Keep `resolveCoverUri`, `isCoverKey`, `normalizeCoverUrl`, `COVER_OPTIONS` unchanged.

- [ ] **Step 4: Create `src/utils/coverSearch.ts`**

```ts
import {
  CoverCategory,
  CoverOption,
  GENERIC_COVER_CATEGORY,
} from "@constants/covers";

export type CoverSearchArgs = {
  query?: string;
  categoryKey?: string | null;
};

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Search/filter the cover catalog. Generic covers are appended to every
 * result set (product rule), so the grid is never empty.
 */
export const searchCovers = (
  covers: readonly CoverOption[],
  categories: readonly CoverCategory[],
  { query, categoryKey }: CoverSearchArgs,
): CoverOption[] => {
  const normalizedQuery = normalize(query ?? "");
  if (!normalizedQuery && !categoryKey) {
    return [...covers];
  }

  const categoryLabels = new Map(
    categories.map((category) => [category.key, normalize(category.label)]),
  );

  let matches: CoverOption[];
  if (normalizedQuery) {
    matches = covers.filter((coverOption) => {
      if (coverOption.category === GENERIC_COVER_CATEGORY) {
        return false;
      }
      if (
        coverOption.tags.some((tag) => normalize(tag).includes(normalizedQuery))
      ) {
        return true;
      }
      const categoryLabel = categoryLabels.get(coverOption.category) ?? "";
      return categoryLabel.includes(normalizedQuery);
    });
  } else {
    matches = covers.filter(
      (coverOption) => coverOption.category === categoryKey,
    );
  }

  const seen = new Set(matches.map((coverOption) => coverOption.key));
  const generic = covers.filter(
    (coverOption) =>
      coverOption.category === GENERIC_COVER_CATEGORY &&
      !seen.has(coverOption.key),
  );
  return [...matches, ...generic];
};
```

- [ ] **Step 5: Run the search tests**

Run: `npx jest src/utils/__tests__/coverSearch.test.ts --runInBand --silent`
Expected: PASS

- [ ] **Step 6: Extend `CoversContext`**

In `src/context/CoversContext.tsx`:

- Add to the context value type: `categories: readonly CoverCategory[];`
- Import `ApiCoverCategory, CoverCategory, mapApiCoverCategory` from `@constants/covers`.
- Fallback context gets `categories: []`.
- In `refreshCovers`, request type becomes `{ data?: unknown; categories?: unknown }` and:

```ts
const rawCategories = payload?.categories;
const nextCategories = Array.isArray(rawCategories)
  ? rawCategories
      .map((item) => mapApiCoverCategory(item as ApiCoverCategory))
      .filter((item): item is CoverCategory => item !== null)
  : [];
setCategories(nextCategories);
```

with `const [categories, setCategories] = useState<readonly CoverCategory[]>([]);`, exposed through the memoized value (add `categories` to the deps and the returned object).

- [ ] **Step 7: Run the impacted suites**

```bash
npx jest src/api/mappers/__tests__/events.test.ts src/screens/create-event/__tests__/createEventForm.test.ts src/context --runInBand --silent
npm run typecheck
```

Expected: PASS / no type errors. (`createEventForm.test.ts` uses `DEFAULT_COVER_KEY` symbolically; `events.test.ts` compares against `resolveCoverUri('badminton')` which is key-agnostic — both should pass untouched. Fix any literal that assumes the old default.)

- [ ] **Step 8: Commit**

```bash
git add src/constants/covers.ts src/utils/coverSearch.ts src/utils/__tests__/coverSearch.test.ts src/context/CoversContext.tsx
git commit -m "feat: categorized cover catalog data layer with search helper"
```

---

### Task 5: Choose Cover overlay UI

**Files:**
- Modify: `src/components/CoverPickerModal.tsx` (rebuild content)
- Modify: `src/components/CoverPickerModal.styles.ts`
- Modify: `src/screens/create-event/CreateEventSheetContent.tsx:27` (title)
- Modify: `src/components/__tests__/CoverPickerModal.test.tsx`

- [ ] **Step 1: Update the component test expectations**

In `src/components/__tests__/CoverPickerModal.test.tsx`: change the `numColumns` expectation from 2 to 3, the title from `'Choose a cover'` to `'Choose cover'`, and drop the subtitle block (the new design has none). Keep the rest.

- [ ] **Step 2: Rebuild `CoverPickerContent`**

`src/components/CoverPickerModal.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import { CoverKey, GENERIC_COVER_CATEGORY } from '@constants/covers';
import { useCovers } from '@context/CoversContext';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing } from '@theme/index';
import { searchCovers } from '@utils/coverSearch';
import CheckSelectedCoverIcon from '@assets/create-event/check-selected-cover.svg';
import SearchIcon from '@assets/create-event/search.svg';
import BottomSheetModal from './BottomSheetModal';
import styles from './CoverPickerModal.styles';

export type CoverPickerModalProps = {
  visible: boolean;
  selectedCoverKey: CoverKey;
  onSelect: (key: CoverKey) => void;
  onClose: () => void;
};

type CoverPickerContentProps = Omit<CoverPickerModalProps, 'visible' | 'onClose'>;

const LIST_MAX_HEIGHT = Dimensions.get('window').height * 0.5;

export const CoverPickerContent: React.FC<CoverPickerContentProps> = ({
  selectedCoverKey,
  onSelect,
}) => {
  const { bottom } = useSafeAreaInsets();
  const { covers, categories } = useCovers();
  const [query, setQuery] = useState('');
  const [categoryKey, setCategoryKey] = useState<string | null>(null);

  const chips = useMemo(
    () => categories.filter((category) => category.key !== GENERIC_COVER_CATEGORY),
    [categories],
  );
  const results = useMemo(
    () => searchCovers(covers, categories, { query, categoryKey }),
    [covers, categories, query, categoryKey],
  );

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (text.trim().length > 0) {
      setCategoryKey(null);
    }
  };

  const handleChipPress = (key: string) => {
    triggerHaptic('selection');
    setQuery('');
    setCategoryKey((current) => (current === key ? null : key));
  };

  return (
    <View style={{ maxHeight: LIST_MAX_HEIGHT, marginBottom: -(8 + bottom) }}>
      <View style={styles.searchContainer}>
        <SearchIcon width={16} height={16} color={colors.cardMeta} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Search"
          placeholderTextColor={colors.cardMeta}
          autoCorrect={false}
          returnKeyType="search"
          testID="cover-search-input"
        />
      </View>
      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          keyboardShouldPersistTaps="handled"
        >
          {chips.map((category) => {
            const isActive = category.key === categoryKey;
            return (
              <Pressable
                key={category.key}
                onPress={() => handleChipPress(category.key)}
                style={[styles.chip, isActive && styles.chipActive]}
                testID={`cover-chip-${category.key}`}
              >
                <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <FlatList
        data={results}
        numColumns={3}
        keyExtractor={(item) => item.key}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isSelected = item.key === selectedCoverKey;
          return (
            <View style={[styles.optionRing, isSelected && styles.optionRingSelected]}>
              <Pressable
                style={styles.option}
                onPress={() => {
                  triggerHaptic('selection');
                  onSelect(item.key);
                }}
              >
                <View style={styles.optionImageWrapper}>
                  <Image source={item.source} style={styles.optionImage} contentFit="cover" />
                </View>
                {isSelected && (
                  <BlurView intensity={60} tint="dark" style={styles.checkBadge}>
                    <CheckSelectedCoverIcon width={14} height={14} />
                  </BlurView>
                )}
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={<View style={{ height: spacing.md }} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const CoverPickerModal: React.FC<CoverPickerModalProps> = ({
  visible,
  onClose,
  ...contentProps
}) => {
  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Choose cover">
      <CoverPickerContent {...contentProps} />
    </BottomSheetModal>
  );
};

export default CoverPickerModal;
```

(Verify `@assets/create-event/search.svg` accepts a `color` prop the way `LocationPickerModal.tsx:95` uses it — same import, same usage.)

- [ ] **Step 3: Update the styles**

`src/components/CoverPickerModal.styles.ts` — replace the file body (keep `subtitle` removed; new keys below):

```ts
import { StyleSheet } from "react-native";

import { colors, radii, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.05)",
        borderRadius: radii.pill,
        borderCurve: "continuous",
        paddingHorizontal: spacing.md,
        paddingVertical: 11,
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    searchInput: {
        flex: 1,
        backgroundColor: "transparent",
        fontSize: 17,
        fontFamily: typography.fontFamilyRegular,
        color: colors.text,
        padding: 0,
        letterSpacing: -0.3,
    },
    chipsRow: {
        flexGrow: 0,
        marginBottom: spacing.sm,
    },
    chipsContent: {
        gap: spacing.xs,
        paddingRight: spacing.md,
    },
    chip: {
        borderRadius: radii.sm,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
        backgroundColor: colors.background,
    },
    chipActive: {
        backgroundColor: colors.text,
        borderColor: colors.text,
    },
    chipLabel: {
        fontSize: typography.caption,
        fontFamily: typography.fontFamilyMedium,
        color: colors.text,
    },
    chipLabelActive: {
        color: colors.background,
    },
    grid: {
        paddingBottom: spacing.sm,
    },
    column: {
        columnGap: spacing.xs,
        marginBottom: spacing.xs,
    },
    optionRing: {
        flex: 1,
        minWidth: 0,
        borderRadius: 14,
        borderCurve: "continuous",
        padding: 2,
        backgroundColor: "transparent",
    },
    optionRingSelected: {
        backgroundColor: colors.text,
    },
    option: {
        flex: 1,
        borderRadius: 12,
        borderCurve: "continuous",
        padding: 1.5,
        backgroundColor: colors.background,
        overflow: "hidden",
    },
    optionImageWrapper: {
        borderRadius: 10,
        borderCurve: "continuous",
        overflow: "hidden",
    },
    optionImage: {
        width: "100%",
        aspectRatio: 1.45,
    },
    checkBadge: {
        position: "absolute",
        top: 6,
        right: 6,
        padding: 6,
        borderRadius: radii.pill,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
});

export default styles;
```

Check `colors.text` exists in `src/theme/colors.ts` (if the token is named differently, e.g. `colors.textPrimary`, use that name in all four places).

- [ ] **Step 4: Update the sheet title**

`src/screens/create-event/CreateEventSheetContent.tsx:27`: `return 'Choose a cover';` → `return 'Choose cover';`
Search for other occurrences: `grep -rn "Choose a cover" src/` and update any test/snapshot expecting the old title.

- [ ] **Step 5: Run tests + typecheck**

```bash
npx jest src/components/__tests__/CoverPickerModal.test.tsx src/screens/__tests__/CreateEventScreen.rendering.test.tsx --runInBand --silent
npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/CoverPickerModal.tsx src/components/CoverPickerModal.styles.ts src/screens/create-event/CreateEventSheetContent.tsx src/components/__tests__/CoverPickerModal.test.tsx
git commit -m "feat: rebuild Choose Cover overlay with search, chips, 3-column grid"
```

---

### Task 6: Full validation, smoke test, docs

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md`, `report/shared-components-refactor-guide.md`

- [ ] **Step 1: Full test suites**

```bash
npx jest --runInBand --silent
npm run typecheck
npm run lint            # no NEW warnings vs baseline
cd server && go test ./... && go vet ./...
```

Expected: all PASS.

- [ ] **Step 2: Mobile smoke test** (see memory: mobile MCP, emulator, Metro 8081, package `com.whoelseisfree.app`)

- Start the Go server locally (`cd server && go run .`), start Metro with `EXPO_PUBLIC_API_BASE_URL` pointing at the host (Android emulator: `http://10.0.2.2:8080`).
- Walk: Create Event → tap cover card → overlay matches design (search pill, chips, 3-col grid) → search "party" (Entertainment covers + generic appear) → chip "Sports" → select a cover → sheet closes, card preview updates → submit → My Events shows the cover.
- Capture before/after screenshots into `report/`.

- [ ] **Step 3: Update docs**

- `CLAUDE.md` + `AGENTS.md` shared-primitives list: add `searchCovers` (`src/utils/coverSearch.ts`) and the covers-sync tool (`server/cmd/covers-sync`, re-run to refresh catalog from Drive).
- `report/shared-components-refactor-guide.md`: update the CoverPicker section (search + chips + 3-col grid, catalog from `covers_catalog.json`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md AGENTS.md report/
git commit -m "docs: document cover catalog sync and new cover picker"
```
