package main

import (
	"bytes"
	"image"
	"image/png"
	"strings"
	"testing"
)

// testPNG encodes a tiny valid PNG; different shades give different bytes.
func testPNG(t *testing.T, shade uint8) []byte {
	t.Helper()
	img := image.NewGray(image.Rect(0, 0, 2, 2))
	for i := range img.Pix {
		img.Pix[i] = shade
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

func TestCheckCoverImage(t *testing.T) {
	valid := testPNG(t, 10)
	oversized := append(append([]byte{}, valid...), make([]byte, maxCoverBytes)...)
	cases := []struct {
		name string
		data []byte
		want string // part of the error; empty means accepted
	}{
		{"png", valid, ""},
		{"jpeg", []byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 'J', 'F', 'I', 'F'}, "is a JPEG"},
		{"web page", []byte("<!DOCTYPE html><html>"), "is not a PNG file"},
		{"broken png", append(append([]byte{}, pngMagic...), "garbage"...), "is not a readable PNG"},
		{"too large", oversized, "covers must be 1 MB or less"},
	}
	for _, tc := range cases {
		err := checkCoverImage(tc.data)
		if tc.want == "" {
			if err != nil {
				t.Fatalf("%s: unexpected error %v", tc.name, err)
			}
			continue
		}
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Fatalf("%s: error = %v, want it to contain %q", tc.name, err, tc.want)
		}
	}
}

func TestSHA256Hex(t *testing.T) {
	if got := sha256Hex([]byte("abc")); got != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatalf("sha256Hex(abc) = %s", got)
	}
}
