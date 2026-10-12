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
	// DriveID is committed in the catalog so deploy-time builds can fetch the
	// images without the repo hosting them (they are gitignored).
	DriveID string `json:"drive_id"`
	// DriveName is the file's name in Drive: a new file with the same name in
	// the same folder as a vanished one takes over its key.
	DriveName string `json:"drive_name,omitempty"`
	// SHA256 fingerprints the image, so a file replaced in place (same Drive
	// ID, new picture) still changes the catalog and gets deployed.
	SHA256 string `json:"sha256,omitempty"`
	// Retired covers were removed from Drive. They stay in the catalog so the
	// key is never reused and plans that use it keep working.
	Retired bool `json:"retired,omitempty"`
}

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
