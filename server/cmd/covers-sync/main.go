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
	"strings"
	"time"
)

const defaultRootFolderID = "1deHHqGMy1DlKpyGoFIHGfRbOQWQuSYO0"

var pngMagic = []byte{0x89, 'P', 'N', 'G'}

func main() {
	root := flag.String("root", defaultRootFolderID, "Drive root folder id")
	assetsDir := flag.String("assets", "assets/covers", "output directory for cover images")
	catalogPath := flag.String("catalog", "covers_catalog.json", "output path for catalog JSON")
	fetch := flag.Bool("fetch", false, "download the images listed in the existing catalog instead of re-discovering Drive (used at deploy time; images are not committed)")
	flag.Parse()

	client := &http.Client{Timeout: 60 * time.Second}

	if *fetch {
		if err := fetchFromCatalog(client, *catalogPath, *assetsDir); err != nil {
			log.Fatalf("fetch covers from catalog: %v", err)
		}
		return
	}

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
		data, err := downloadFileWithRetry(client, cover.DriveID)
		if err != nil {
			log.Fatalf("download %s (%s): %v", cover.Key, cover.DriveID, err)
		}
		images[cover.FileName] = data
		log.Printf("[%d/%d] %s (%d KB)", i+1, len(catalog.Covers), cover.FileName, len(data)/1024)
	}

	for fileName, data := range images {
		if err := os.WriteFile(filepath.Join(*assetsDir, fileName), data, 0o644); err != nil {
			log.Fatalf("write %s: %v", fileName, err)
		}
	}

	keep := make(map[string]bool, len(images))
	for fileName := range images {
		keep[fileName] = true
	}
	removed, err := pruneOrphans(*assetsDir, keep)
	if err != nil {
		log.Fatalf("prune orphans: %v", err)
	}
	for _, name := range removed {
		log.Printf("pruned orphan %s", name)
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

// fetchFromCatalog downloads every cover listed in the committed catalog into
// assetsDir, skipping files that are already present and valid. The Docker
// build runs this so the public repo never has to host the images themselves.
func fetchFromCatalog(client *http.Client, catalogPath, assetsDir string) error {
	raw, err := os.ReadFile(catalogPath)
	if err != nil {
		return fmt.Errorf("read catalog: %w", err)
	}
	var catalog coverCatalogFile
	if err := json.Unmarshal(raw, &catalog); err != nil {
		return fmt.Errorf("parse catalog: %w", err)
	}
	if len(catalog.Covers) == 0 {
		return fmt.Errorf("catalog has no covers")
	}
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		return fmt.Errorf("create assets dir: %w", err)
	}

	keep := make(map[string]bool, len(catalog.Covers))
	downloaded := 0
	for i, cover := range catalog.Covers {
		keep[cover.FileName] = true
		if cover.DriveID == "" {
			return fmt.Errorf("cover %s has no drive_id; re-run covers-sync discovery", cover.Key)
		}
		path := filepath.Join(assetsDir, cover.FileName)
		if existing, err := os.ReadFile(path); err == nil && bytes.HasPrefix(existing, pngMagic) {
			continue
		}
		data, err := downloadFileWithRetry(client, cover.DriveID)
		if err != nil {
			return fmt.Errorf("download %s (%s): %w", cover.Key, cover.DriveID, err)
		}
		if err := os.WriteFile(path, data, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", cover.FileName, err)
		}
		downloaded++
		log.Printf("[%d/%d] fetched %s (%d KB)", i+1, len(catalog.Covers), cover.FileName, len(data)/1024)
	}

	removed, err := pruneOrphans(assetsDir, keep)
	if err != nil {
		return fmt.Errorf("prune orphans: %w", err)
	}
	for _, name := range removed {
		log.Printf("pruned orphan %s", name)
	}
	log.Printf("fetch complete: %d covers (%d downloaded, %d already present)", len(catalog.Covers), downloaded, len(catalog.Covers)-downloaded)
	return nil
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
		time.Sleep(time.Duration(attempt) * 2 * time.Second)
	}
	return nil, lastErr
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
