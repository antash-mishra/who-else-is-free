package main

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"sort"
)

type AgeRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}
type AgeGroupIDs []string

var agePresets = map[string]AgeRange{"all": {18, 60}, "20s": {18, 29}, "20-25": {20, 25}, "25-30": {25, 30}, "30s": {30, 39}, "30-35": {30, 35}, "35-40": {35, 40}, "40+": {40, 60}}
var agePresetOrder = []string{"all", "20s", "20-25", "25-30", "30s", "30-35", "35-40", "40+"}

func normalizeAgeGroups(ids AgeGroupIDs) (AgeGroupIDs, []AgeRange, error) {
	if len(ids) == 0 || len(ids) > len(agePresets) {
		return nil, nil, fmt.Errorf("invalid age selection")
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if _, ok := agePresets[id]; !ok {
			return nil, nil, fmt.Errorf("unknown age group")
		}
		seen[id] = true
	}
	if seen["all"] && len(seen) > 1 {
		return nil, nil, fmt.Errorf("all ages is exclusive")
	}
	normalized := AgeGroupIDs{}
	ranges := []AgeRange{}
	for _, id := range agePresetOrder {
		if seen[id] {
			normalized = append(normalized, id)
			ranges = append(ranges, agePresets[id])
		}
	}
	sort.Slice(ranges, func(i, j int) bool { return ranges[i].Min < ranges[j].Min })
	merged := []AgeRange{}
	for _, current := range ranges {
		n := len(merged)
		if n > 0 && current.Min <= merged[n-1].Max+1 {
			if current.Max > merged[n-1].Max {
				merged[n-1].Max = current.Max
			}
		} else {
			merged = append(merged, current)
		}
	}
	return normalized, merged, nil
}
func (ids AgeGroupIDs) Value() (driver.Value, error) {
	if ids == nil {
		return "", nil
	}
	data, err := json.Marshal(ids)
	return string(data), err
}
func (ids *AgeGroupIDs) Scan(value any) error {
	var data string
	switch v := value.(type) {
	case string:
		data = v
	case []byte:
		data = string(v)
	case nil:
		*ids = nil
		return nil
	default:
		return fmt.Errorf("invalid age data")
	}
	if data == "" {
		*ids = nil
		return nil
	}
	return json.Unmarshal([]byte(data), ids)
}
func (e Event) MarshalJSON() ([]byte, error) {
	type alias Event
	ranges := []AgeRange{{e.MinAge, e.MaxAge}}
	if e.AgeGroupIDs != nil {
		_, r, err := normalizeAgeGroups(e.AgeGroupIDs)
		if err != nil {
			return nil, err
		}
		ranges = r
	}
	return json.Marshal(struct {
		alias
		AgeRanges []AgeRange `json:"age_ranges"`
		CoverURL  string     `json:"cover_url,omitempty"`
	}{alias(e), ranges, coverURL(e.CoverUploadID)})
}
func (r *EventRepository) ensureEventFeatureColumns(ctx context.Context) error {
	if err := r.ensureCoverUploads(ctx); err != nil {
		return err
	}
	rows, err := r.db.QueryContext(ctx, "PRAGMA table_info(events)")
	if err != nil {
		return err
	}
	names := map[string]bool{}
	for rows.Next() {
		var cid, notnull, pk int
		var name, kind string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &kind, &notnull, &defaultValue, &pk); err != nil {
			rows.Close()
			return err
		}
		names[name] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if !names["age_group_ids"] {
		_, err = r.db.ExecContext(ctx, "ALTER TABLE events ADD COLUMN age_group_ids TEXT NOT NULL DEFAULT ''")
		if err != nil {
			return err
		}
	}
	if !names["cover_upload_id"] {
		if _, err := r.db.ExecContext(ctx, "ALTER TABLE events ADD COLUMN cover_upload_id TEXT REFERENCES event_cover_uploads(id)"); err != nil {
			return err
		}
	}
	return nil
}
