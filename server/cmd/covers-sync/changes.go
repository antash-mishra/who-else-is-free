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
