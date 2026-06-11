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
