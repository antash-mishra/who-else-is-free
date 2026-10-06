package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCustomEventCoverHTTP(t *testing.T) {
	t.Setenv("EVENT_COVERS_DIR", t.TempDir())
	env := setupAPITestEnv(t)
	token := env.issueTokenForEmail(t, "ava@example.com")
	upload := func(token string, data []byte) *http.Response {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("image", "synthetic.png")
		if err != nil {
			t.Fatal(err)
		}
		part.Write(data)
		writer.Close()
		req, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/event-covers", &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp
	}
	var input bytes.Buffer
	png.Encode(&input, image.NewNRGBA(image.Rect(0, 0, 12, 8)))
	resp := upload(token, input.Bytes())
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("upload: %d", resp.StatusCode)
	}
	cover := decodeJSON[map[string]string](t, resp)
	if cover["cover_upload_id"] == "" || cover["cover_url"] == "" {
		t.Fatal("missing upload reference")
	}
	animated := append([]byte{}, input.Bytes()[:33]...)
	var chunk bytes.Buffer
	binary.Write(&chunk, binary.BigEndian, uint32(8))
	chunk.WriteString("acTL")
	binary.Write(&chunk, binary.BigEndian, uint32(2))
	binary.Write(&chunk, binary.BigEndian, uint32(0))
	binary.Write(&chunk, binary.BigEndian, crc32.ChecksumIEEE(chunk.Bytes()[4:]))
	animated = append(animated, chunk.Bytes()...)
	animated = append(animated, input.Bytes()[33:]...)
	for _, bad := range [][]byte{[]byte("not an image"), bytes.Repeat([]byte("x"), 6<<20), animated} {
		resp = upload(token, bad)
		if resp.StatusCode != 400 && resp.StatusCode != 413 {
			t.Fatalf("invalid upload: %d", resp.StatusCode)
		}
		resp.Body.Close()
	}
	resp = upload("", input.Bytes())
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous upload: %d", resp.StatusCode)
	}
	resp.Body.Close()
	body := map[string]any{"title": "Photo plan", "location": "Synthetic place", "time": "12:00", "event_date": time.Now().AddDate(0, 0, 1).Format("2006-01-02"), "gender": "Any", "min_age": 18, "max_age": 60, "group_type": "Group", "cover_upload_id": cover["cover_upload_id"]}
	resp = env.doRequest(t, "POST", "/api/events", env.issueTokenForEmail(t, "noah@example.com"), body)
	if resp.StatusCode != 400 {
		t.Fatalf("foreign cover accepted: %d", resp.StatusCode)
	}
	resp.Body.Close()
	resp = env.doRequest(t, "POST", "/api/events", token, body)
	if resp.StatusCode != 201 {
		t.Fatalf("attach: %d", resp.StatusCode)
	}
	created := decodeJSON[map[string]int64](t, resp)
	if err := env.repo.Init(context.Background()); err != nil {
		t.Fatal(err)
	}
	get := func() map[string]any {
		rows := decodeJSON[struct {
			Data []map[string]any `json:"data"`
		}](t, env.doRequest(t, "GET", "/api/events", "", nil))
		for _, row := range rows.Data {
			if row["id"] == float64(created["id"]) {
				return row
			}
		}
		t.Fatal("missing event")
		return nil
	}
	if get()["cover_url"] != cover["cover_url"] {
		t.Fatal("cover lost after restart")
	}
	conversations, err := env.repo.ListConversations(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, conversation := range conversations {
		if conversation.Event != nil && conversation.Event.ID == created["id"] {
			found = true
			if conversation.Event.CoverURL != cover["cover_url"] {
				t.Fatal("chat cover missing")
			}
		}
	}
	if !found {
		t.Fatal("created plan missing from conversations")
	}
	dataWithCover := env.hub.decorateCustomCover(map[string]string{"eventId": fmt.Sprint(created["id"]), "coverKey": defaultCoverKey})
	if dataWithCover["coverUrl"] != cover["cover_url"] {
		t.Fatal("notification cover missing")
	}

	resp, err = http.Get(env.server.URL + cover["cover_url"])
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("serve: %d", resp.StatusCode)
	}
	data, _ := io.ReadAll(resp.Body)
	if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
	delete(body, "cover_upload_id")
	resp = env.doRequest(t, "PUT", fmt.Sprintf("/api/events/%d", created["id"]), token, body)
	if resp.StatusCode != 200 {
		t.Fatalf("legacy update: %d", resp.StatusCode)
	}
	resp.Body.Close()
	if get()["cover_url"] != cover["cover_url"] {
		t.Fatal("legacy update cleared cover")
	}
	body["cover_upload_id"] = nil
	body["cover_key"] = defaultCoverKey
	resp = env.doRequest(t, "PUT", fmt.Sprintf("/api/events/%d", created["id"]), token, body)
	if resp.StatusCode != 200 {
		t.Fatalf("clear: %d", resp.StatusCode)
	}
	resp.Body.Close()
	if get()["cover_url"] != nil {
		t.Fatal("custom cover not cleared")
	}
	before, err := os.ReadDir(eventCoverDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := env.db.Exec(`CREATE TRIGGER fail_cover_insert BEFORE INSERT ON event_cover_uploads BEGIN SELECT RAISE(FAIL,'synthetic storage failure'); END`); err != nil {
		t.Fatal(err)
	}
	resp = upload(token, input.Bytes())
	if resp.StatusCode != 500 {
		t.Fatalf("metadata failure: %d", resp.StatusCode)
	}
	resp.Body.Close()
	after, err := os.ReadDir(eventCoverDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(before) != len(after) {
		t.Fatal("failed upload left an orphan file")
	}

}

func TestCoverOrientationAndResize(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 2, 3))
	oriented := orientCover(source, 6)
	if oriented.Bounds().Dx() != 3 || oriented.Bounds().Dy() != 2 {
		t.Fatal("portrait orientation lost")
	}
	resized := resizeCover(image.NewNRGBA(image.Rect(0, 0, 2000, 1000)))
	if resized.Bounds().Dx() != 1600 || resized.Bounds().Dy() != 800 {
		t.Fatal("unbounded output dimensions")
	}
}

func TestCoverCleanupKeepsReferencedMedia(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("EVENT_COVERS_DIR", dir)
	env := setupAPITestEnv(t)
	handler := newEventCoverHandler(env.repo)
	ctx := context.Background()
	ids := []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"}
	old := time.Now().Add(-8 * 24 * time.Hour)
	for _, id := range ids {
		if _, err := env.db.Exec("INSERT INTO event_cover_uploads(id,user_id,created_at) VALUES(?,1,?)", id, old.UTC().Format("2006-01-02 15:04:05")); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(dir, id+".jpg")
		if err := os.WriteFile(path, []byte("synthetic"), 0600); err != nil {
			t.Fatal(err)
		}
		os.Chtimes(path, old, old)
	}
	if _, err := env.db.Exec("INSERT INTO events(user_id,title,location,time,event_date,gender,min_age,max_age,date_label,group_type,cover_upload_id) VALUES(1,'Synthetic','Test','12:00','2030-01-01','Any',18,60,'Tmrw','Single',?)", ids[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := env.db.Exec("INSERT INTO notifications(user_id,type,title,body,payload) VALUES(1,'event.deleted','Synthetic','Synthetic',?)", `{"coverUrl":"/api/event-covers/`+ids[1]+`"}`); err != nil {
		t.Fatal(err)
	}
	if err := handler.cleanup(ctx, time.Now()); err != nil {
		t.Fatal(err)
	}
	for _, id := range ids[:2] {
		if _, err := os.Stat(filepath.Join(dir, id+".jpg")); err != nil {
			t.Fatal("referenced file removed")
		}
	}
	if _, err := os.Stat(filepath.Join(dir, ids[2]+".jpg")); !os.IsNotExist(err) {
		t.Fatal("abandoned upload retained")
	}
}
