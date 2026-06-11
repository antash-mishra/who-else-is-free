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
