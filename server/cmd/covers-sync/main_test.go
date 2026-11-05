package main

import (
	"bytes"
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func TestPruneOrphans(t *testing.T) {
	dir := t.TempDir()
	write := func(name string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	write("sports-badminton-1.png")
	write("sports-tennis-1.png")
	write("outdoor-nature-hiking-1.png") // orphan: tag folder renamed in Drive
	write("notes.txt")                   // non-PNG must survive
	if err := os.Mkdir(filepath.Join(dir, "nested"), 0o755); err != nil {
		t.Fatalf("mkdir nested: %v", err)
	}

	removed, err := pruneOrphans(dir, map[string]bool{
		"sports-badminton-1.png": true,
		"sports-tennis-1.png":    true,
	})
	if err != nil {
		t.Fatalf("pruneOrphans: %v", err)
	}
	if want := []string{"outdoor-nature-hiking-1.png"}; !reflect.DeepEqual(removed, want) {
		t.Fatalf("removed = %v, want %v", removed, want)
	}

	for _, name := range []string{"sports-badminton-1.png", "sports-tennis-1.png", "notes.txt"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatalf("%s should still exist: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "outdoor-nature-hiking-1.png")); !os.IsNotExist(err) {
		t.Fatalf("orphan should be deleted, stat err = %v", err)
	}
	if info, err := os.Stat(filepath.Join(dir, "nested")); err != nil || !info.IsDir() {
		t.Fatalf("nested dir should be untouched: %v", err)
	}
}

func TestPruneOrphansNoOrphans(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "generic-1.png"), []byte("x"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	removed, err := pruneOrphans(dir, map[string]bool{"generic-1.png": true})
	if err != nil {
		t.Fatalf("pruneOrphans: %v", err)
	}
	if len(removed) != 0 {
		t.Fatalf("removed = %v, want none", removed)
	}
}

// fakeDrive serves Drive's embedded folder pages and file downloads from
// memory, so whole syncs run without the network.
type fakeDrive struct {
	mu        sync.Mutex
	folders   map[string][]driveEntry
	files     map[string][]byte
	downloads map[string]int
	failures  map[string]int // requests per folder or file ID to answer with a 500
}

func (d *fakeDrive) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	defer d.mu.Unlock()
	id := r.URL.Query().Get("id")
	if d.failures[id] > 0 {
		d.failures[id]--
		http.Error(w, "backend error", http.StatusInternalServerError)
		return
	}
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

// failNext makes Drive answer the next n requests for id with a 500.
func (d *fakeDrive) failNext(id string, n int) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.failures == nil {
		d.failures = map[string]int{}
	}
	d.failures[id] = n
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

func TestSyncCatalogRidesOutTransientDriveErrors(t *testing.T) {
	badminton := testPNG(t, 10)
	catalogPath, assetsDir := syncPaths(t)
	mustWriteCatalog(t, catalogPath, coverCatalogFile{Categories: testCategories, Covers: []catalogCover{badmintonCover(badminton)}})
	drive := startFakeDrive(t,
		testDriveFolders([]driveEntry{{ID: "bad1", Title: "image 1094.png"}}, nil),
		map[string][]byte{"bad1": badminton},
	)
	// Drive answers the odd request with a 500 (seen live on a folder listing).
	drive.failNext("tag-badminton", 2)
	drive.failNext("bad1", 2)

	summary, err := syncCatalog(http.DefaultClient, syncOptions{rootID: "root", assetsDir: assetsDir, catalogPath: catalogPath})
	if err != nil {
		t.Fatalf("syncCatalog: %v", err)
	}
	if summary != "No cover changes\n" {
		t.Fatalf("summary = %q", summary)
	}
}
