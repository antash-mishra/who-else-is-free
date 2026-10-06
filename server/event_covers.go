package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const maxCoverBytes = 5 << 20

var ErrInvalidEventCover = errors.New("invalid event cover")

func eventCoverDir() string {
	if dir := os.Getenv("EVENT_COVERS_DIR"); dir != "" {
		return dir
	}
	if _, err := os.Stat("/data"); err == nil {
		return "/data/event-covers"
	}
	return ".data/event-covers"
}
func coverURL(id *string) string {
	if id == nil || *id == "" {
		return ""
	}
	return "/api/event-covers/" + *id
}
func parseCoverUpdate(raw json.RawMessage) (bool, *string, error) {
	if len(raw) == 0 {
		return false, nil, nil
	}
	var id *string
	if err := json.Unmarshal(raw, &id); err != nil {
		return true, nil, ErrInvalidEventCover
	}
	if id != nil && *id == "" {
		return true, nil, ErrInvalidEventCover
	}
	return true, id, nil
}
func validateCoverOwner(ctx context.Context, tx *sql.Tx, id *string, userID int64) error {
	if id == nil {
		return nil
	}
	var exists int
	if err := tx.QueryRowContext(ctx, "SELECT 1 FROM event_cover_uploads WHERE id = ? AND user_id = ?", *id, userID).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrInvalidEventCover
		}
		return err
	}
	if _, err := os.Stat(filepath.Join(eventCoverDir(), *id+".jpg")); err != nil {
		return ErrInvalidEventCover
	}
	return nil
}

// Bounded bilinear resampling keeps decoded covers small without a provider SDK.
func resizeCover(src image.Image) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 1600 && h <= 1600 {
		return src
	}
	if w >= h {
		h = max(1, h*1600/w)
		w = 1600
	} else {
		w = max(1, w*1600/h)
		h = 1600
	}
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		fy := float64(y) * float64(b.Dy()-1) / float64(max(1, h-1))
		y0 := int(fy)
		dy := fy - float64(y0)
		for x := 0; x < w; x++ {
			fx := float64(x) * float64(b.Dx()-1) / float64(max(1, w-1))
			x0 := int(fx)
			dx := fx - float64(x0)
			a := color.NRGBAModel.Convert(src.At(b.Min.X+x0, b.Min.Y+y0)).(color.NRGBA)
			c := color.NRGBAModel.Convert(src.At(b.Min.X+min(x0+1, b.Dx()-1), b.Min.Y+y0)).(color.NRGBA)
			d := color.NRGBAModel.Convert(src.At(b.Min.X+x0, b.Min.Y+min(y0+1, b.Dy()-1))).(color.NRGBA)
			e := color.NRGBAModel.Convert(src.At(b.Min.X+min(x0+1, b.Dx()-1), b.Min.Y+min(y0+1, b.Dy()-1))).(color.NRGBA)
			mix := func(a, c, d, e uint8) uint8 {
				return uint8((float64(a)*(1-dx)+float64(c)*dx)*(1-dy) + (float64(d)*(1-dx)+float64(e)*dx)*dy)
			}
			dst.SetNRGBA(x, y, color.NRGBA{mix(a.R, c.R, d.R, e.R), mix(a.G, c.G, d.G, e.G), mix(a.B, c.B, d.B, e.B), 255})
		}
	}
	return dst
}

type EventCoverHandler struct {
	repo       *EventRepository
	dir        string
	processing chan struct{}
}

func newEventCoverHandler(repo *EventRepository) *EventCoverHandler {
	return &EventCoverHandler{repo: repo, dir: eventCoverDir(), processing: make(chan struct{}, 1)}
}
func (h *EventCoverHandler) upload(c *gin.Context) {
	select {
	case h.processing <- struct{}{}:
		defer func() { <-h.processing }()
	default:
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "photo processing busy; try again"})
		return
	}
	cleanupCtx, cleanupCancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	if err := h.cleanup(cleanupCtx, time.Now()); err != nil {
		log.Printf("event covers: cleanup failed (%T)", err)
	}
	cleanupCancel()
	claims, ok := sessionFromContext(c)
	if !ok {
		c.Status(http.StatusUnauthorized)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxCoverBytes+(64<<10))
	if err := c.Request.ParseMultipartForm(maxCoverBytes + (64 << 10)); err != nil {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "photo must be at most 5 MiB"})
		return
	}
	defer c.Request.MultipartForm.RemoveAll()
	file, _, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(400, gin.H{"error": "image is required"})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxCoverBytes+1))
	if err != nil {
		c.JSON(400, gin.H{"error": "unable to read image"})
		return
	}
	if len(data) > maxCoverBytes {
		c.JSON(413, gin.H{"error": "photo must be at most 5 MiB"})
		return
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "jpeg" && format != "png") || (format == "png" && animatedPNG(data)) || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 20_000_000 {
		c.JSON(400, gin.H{"error": "choose a JPEG or PNG photo of at most 20 megapixels"})
		return
	}
	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid image"})
		return
	}
	if err := os.MkdirAll(h.dir, 0700); err != nil {
		c.JSON(500, gin.H{"error": "unable to save photo"})
		return
	}
	id := uuid.NewString()
	path := filepath.Join(h.dir, id+".jpg")
	output, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		c.JSON(500, gin.H{"error": "unable to save photo"})
		return
	}
	err = jpeg.Encode(output, resizeCover(orientCover(decoded, jpegOrientation(data))), &jpeg.Options{Quality: 85})
	if err == nil {
		err = output.Sync()
	}
	closeErr := output.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(path)
		c.JSON(500, gin.H{"error": "unable to save photo"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	if _, err := h.repo.db.ExecContext(ctx, "INSERT INTO event_cover_uploads(id,user_id) VALUES(?,?)", id, claims.UserID); err != nil {
		os.Remove(path)
		c.JSON(500, gin.H{"error": "unable to save photo"})
		return
	}
	c.JSON(201, gin.H{"cover_upload_id": id, "cover_url": coverURL(&id)})
}
func (h *EventCoverHandler) serve(c *gin.Context) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.Status(404)
		return
	}
	var exists int
	if err := h.repo.db.QueryRowContext(c.Request.Context(), "SELECT 1 FROM event_cover_uploads WHERE id=?", id).Scan(&exists); err != nil {
		c.Status(404)
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "public, max-age=86400")
	c.Header("Content-Type", "image/jpeg")
	c.File(filepath.Join(h.dir, id+".jpg"))
}

// Metadata is additive and idempotent. Uploaded bytes live outside the checkout.
func (r *EventRepository) ensureCoverUploads(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS event_cover_uploads(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`)
	return err
}
func (h *EventCoverHandler) cleanup(ctx context.Context, now time.Time) error {
	tx, err := h.repo.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id FROM event_cover_uploads u WHERE created_at < ? AND NOT EXISTS(SELECT 1 FROM events e WHERE e.cover_upload_id=u.id) AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.payload LIKE '%' || u.id || '%')`, now.Add(-7*24*time.Hour).UTC().Format("2006-01-02 15:04:05"))
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, "DELETE FROM event_cover_uploads WHERE id=?", id); err != nil {
			return fmt.Errorf("delete abandoned cover: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	// Also recover files left by a crash or account deletion. A seven-day grace
	// period protects in-progress uploads, which write the file before metadata.
	files, err := os.ReadDir(h.dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, file := range files {
		if file.IsDir() || filepath.Ext(file.Name()) != ".jpg" {
			continue
		}
		id := strings.TrimSuffix(file.Name(), ".jpg")
		if _, err := uuid.Parse(id); err != nil {
			continue
		}
		info, err := file.Info()
		if err != nil {
			return err
		}
		if info.ModTime().After(now.Add(-7 * 24 * time.Hour)) {
			continue
		}
		var exists int
		err = h.repo.db.QueryRowContext(ctx, "SELECT 1 FROM event_cover_uploads WHERE id=?", id).Scan(&exists)
		if err == nil {
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err := os.Remove(filepath.Join(h.dir, file.Name())); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func animatedPNG(data []byte) bool {
	for pos := 8; pos+12 <= len(data); {
		size := uint64(binary.BigEndian.Uint32(data[pos : pos+4]))
		if size+12 > uint64(len(data)-pos) {
			return false
		}
		if string(data[pos+4:pos+8]) == "acTL" {
			return true
		}
		pos += int(size) + 12
	}
	return false
}
