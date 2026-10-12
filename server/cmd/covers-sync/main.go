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

// pruneOrphans deletes catalog-managed PNGs in dir that are absent from the
// freshly built catalog (covers removed from Drive, or keys changed by a tag
// folder rename). Non-PNG files and subdirectories are left untouched.
func pruneOrphans(dir string, keep map[string]bool) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var removed []string
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(name), ".png") || keep[name] {
			continue
		}
		if err := os.Remove(filepath.Join(dir, name)); err != nil {
			return removed, fmt.Errorf("remove %s: %w", name, err)
		}
		removed = append(removed, name)
	}
	return removed, nil
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
	url := driveFolderURL + folderID
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
