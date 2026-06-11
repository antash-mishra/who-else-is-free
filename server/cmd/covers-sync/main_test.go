package main

import (
	"os"
	"path/filepath"
	"reflect"
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
