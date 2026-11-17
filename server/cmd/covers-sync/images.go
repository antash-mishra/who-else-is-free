package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image/png"
)

// maxCoverBytes keeps covers light on phones: today's 600×600 covers are at
// most ~330 KB, while an accidental full-size export runs to several MB.
const maxCoverBytes = 1 << 20

var (
	pngMagic  = []byte{0x89, 'P', 'N', 'G'}
	jpegMagic = []byte{0xFF, 0xD8, 0xFF}
)

// checkCoverImage explains, for whoever uploaded the file, why data cannot be
// used as a cover; nil means it can. Messages follow the file's Drive path.
func checkCoverImage(data []byte) error {
	switch {
	case bytes.HasPrefix(data, jpegMagic):
		return fmt.Errorf("is a JPEG; covers must be PNG files")
	case !bytes.HasPrefix(data, pngMagic):
		return fmt.Errorf("is not a PNG file")
	}
	if _, err := png.DecodeConfig(bytes.NewReader(data)); err != nil {
		return fmt.Errorf("is not a readable PNG (%v)", err)
	}
	if len(data) > maxCoverBytes {
		return fmt.Errorf("is %.1f MB; covers must be 1 MB or less (export it at 600×600 like the others)", float64(len(data))/(1<<20))
	}
	return nil
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
