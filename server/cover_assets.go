package main

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

var coverAssetNamePattern = regexp.MustCompile(`^[a-z0-9-]+\.png$`)

// coverAssetHandler serves catalog cover images from dir. A cover removed from
// Drive has no image any more, so its URL serves its stand-in's image: plans,
// chats and notifications that still use the key keep a similar picture.
func coverAssetHandler(dir string, catalog *coverIndex) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := c.Param("file")
		if !coverAssetNamePattern.MatchString(name) {
			c.Status(http.StatusNotFound)
			return
		}
		path := filepath.Join(dir, name)
		if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
			c.File(path)
			return
		}
		if standIn, ok := catalog.standIns[strings.TrimSuffix(name, ".png")]; ok {
			c.File(filepath.Join(dir, standIn+".png"))
			return
		}
		c.Status(http.StatusNotFound)
	}
}
