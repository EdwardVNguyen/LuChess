package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const (
	sampleFEN = "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"
	samplePGN = "[Event \"Casual\"]\n\n1. e4 e5 2. Nf3 *"
)

type noteResponse struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	PGN       string    `json:"pgn"`
	StartFEN  *string   `json:"startFen"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func noteBody(name, pgn string, startFEN *string) string {
	b, _ := json.Marshal(map[string]any{"name": name, "pgn": pgn, "startFen": startFEN})
	return string(b)
}

func (a *app) createNote(s session, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodPost, "/api/notes", body, withBearer(s.AccessToken))
}

func (a *app) mustCreateNote(s session, name, pgn string, startFEN *string) noteResponse {
	a.t.Helper()
	rec := a.createNote(s, noteBody(name, pgn, startFEN))
	if rec.Code != http.StatusCreated {
		a.t.Fatalf("create note: status = %d (body %s)", rec.Code, rec.Body)
	}
	var n noteResponse
	decodeInto(a.t, rec, &n)
	return n
}

func (a *app) listNotes(s session) []noteResponse {
	a.t.Helper()
	rec := a.send(http.MethodGet, "/api/notes", "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list notes: status = %d (body %s)", rec.Code, rec.Body)
	}
	var notes []noteResponse
	decodeInto(a.t, rec, &notes)
	return notes
}

func notePath(id int64) string { return fmt.Sprintf("/api/notes/%d", id) }

func TestCreateAndOpenANoteFromAPGN(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")

	created := a.mustCreateNote(s, "  Italian ideas  ", samplePGN, nil)

	rec := a.send(http.MethodGet, notePath(created.ID), "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		t.Fatalf("get: status = %d (body %s)", rec.Code, rec.Body)
	}
	var got noteResponse
	decodeInto(t, rec, &got)
	if got.Name != "Italian ideas" || got.PGN != samplePGN || got.StartFEN != nil {
		t.Fatalf("note = %+v", got)
	}
	if !got.CreatedAt.Equal(a.clock.Now()) || !got.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("timestamps = %v / %v, want %v", got.CreatedAt, got.UpdatedAt, a.clock.Now())
	}
}

func TestCreateANoteThatIsOnlyAPosition(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	fen := sampleFEN

	created := a.mustCreateNote(s, "King and pawn", "[FEN \""+fen+"\"]\n\n*", &fen)

	if created.StartFEN == nil || *created.StartFEN != fen {
		t.Fatalf("startFen = %v, want %q", created.StartFEN, fen)
	}
}

func TestCreateNoteRejectsBadInput(t *testing.T) {
	longName := strings.Repeat("a", 201)
	badFEN := "not a fen"
	shortRank := "8/8/8/8/8/8/8/7 w - - 0 1"
	cases := map[string]string{
		"empty name":        noteBody("   ", samplePGN, nil),
		"name too long":     noteBody(longName, samplePGN, nil),
		"control in name":   noteBody("a\x07b", samplePGN, nil),
		"empty PGN":         noteBody("Note", "  \n ", nil),
		"PGN too large":     noteBody("Note", strings.Repeat("1. e4 ", 12000), nil),
		"malformed FEN":     noteBody("Note", samplePGN, &badFEN),
		"rank of 7 squares": noteBody("Note", samplePGN, &shortRank),
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			a := newApp(t)
			s := loggedInAs(t, a, "ada@example.com", "Ada")
			if rec := a.createNote(s, body); rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
			}
			if n := len(a.listNotes(s)); n != 0 {
				t.Fatalf("%d notes saved, want 0", n)
			}
		})
	}
}

func TestTwoNotesMayShareAName(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")

	first := a.mustCreateNote(s, "Same", samplePGN, nil)
	second := a.mustCreateNote(s, "Same", samplePGN, nil)

	if first.ID == second.ID {
		t.Fatal("both notes got the same ID")
	}
	if n := len(a.listNotes(s)); n != 2 {
		t.Fatalf("listed %d notes, want 2", n)
	}
}

func TestListShowsOnlyTheUsersNotesMostRecentlyUpdatedFirst(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")

	older := a.mustCreateNote(ada, "Older", samplePGN, nil)
	a.clock.Advance(time.Minute)
	a.mustCreateNote(ada, "Newer", samplePGN, nil)
	a.mustCreateNote(bob, "Bob's", samplePGN, nil)
	a.clock.Advance(time.Minute)
	a.send(http.MethodPatch, notePath(older.ID), `{"name":"Older, renamed"}`, withBearer(ada.AccessToken))

	notes := a.listNotes(ada)

	var names []string
	for _, n := range notes {
		names = append(names, n.Name)
	}
	if strings.Join(names, "|") != "Older, renamed|Newer" {
		t.Fatalf("names = %v", names)
	}
	if notes[0].PGN != "" {
		t.Fatal("list should not carry the PGN")
	}
}

func TestRenameUpdatesNameAndUpdatedAt(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Old", samplePGN, nil)
	a.clock.Advance(time.Minute)

	rec := a.send(http.MethodPatch, notePath(n.ID), `{"name":" New "}`, withBearer(s.AccessToken))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}
	var got noteResponse
	decodeInto(t, rec, &got)
	if got.Name != "New" || got.PGN != samplePGN {
		t.Fatalf("note = %+v", got)
	}
	if !got.CreatedAt.Equal(n.CreatedAt) || !got.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("timestamps = %v / %v", got.CreatedAt, got.UpdatedAt)
	}

	if rec := a.send(http.MethodPatch, notePath(n.ID), `{"name":""}`, withBearer(s.AccessToken)); rec.Code != http.StatusBadRequest {
		t.Fatalf("empty rename: status = %d, want 400", rec.Code)
	}
}

func TestDeleteRemovesTheNote(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Gone", samplePGN, nil)

	if rec := a.send(http.MethodDelete, notePath(n.ID), "", withBearer(s.AccessToken)); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d (body %s)", rec.Code, rec.Body)
	}
	if rec := a.send(http.MethodGet, notePath(n.ID), "", withBearer(s.AccessToken)); rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: status = %d, want 404", rec.Code)
	}
	if rec := a.send(http.MethodDelete, notePath(n.ID), "", withBearer(s.AccessToken)); rec.Code != http.StatusNotFound {
		t.Fatalf("second delete: status = %d, want 404", rec.Code)
	}
}

func TestAnotherUsersNoteIsNotFound(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")
	n := a.mustCreateNote(ada, "Private", samplePGN, nil)

	requests := map[string]struct{ method, body string }{
		"get":    {http.MethodGet, ""},
		"rename": {http.MethodPatch, `{"name":"Mine now"}`},
		"delete": {http.MethodDelete, ""},
	}
	for name, req := range requests {
		t.Run(name, func(t *testing.T) {
			rec := a.send(req.method, notePath(n.ID), req.body, withBearer(bob.AccessToken))
			if rec.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404 (body %s)", rec.Code, rec.Body)
			}
		})
	}

	rec := a.send(http.MethodGet, notePath(n.ID), "", withBearer(ada.AccessToken))
	var got noteResponse
	decodeInto(t, rec, &got)
	if got.Name != "Private" {
		t.Fatalf("Ada's note changed: %+v", got)
	}
}

func TestMalformedNoteIDIsNotFound(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	for _, id := range []string{"abc", "0", "-1"} {
		if rec := a.send(http.MethodGet, "/api/notes/"+id, "", withBearer(s.AccessToken)); rec.Code != http.StatusNotFound {
			t.Fatalf("id %q: status = %d, want 404", id, rec.Code)
		}
	}
}

func TestNoteEndpointsRequireAuth(t *testing.T) {
	a := newApp(t)
	for _, req := range []struct{ method, path string }{
		{http.MethodGet, "/api/notes"},
		{http.MethodPost, "/api/notes"},
		{http.MethodGet, "/api/notes/1"},
		{http.MethodPatch, "/api/notes/1"},
		{http.MethodDelete, "/api/notes/1"},
	} {
		if rec := a.send(req.method, req.path, ""); rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: status = %d, want 401", req.method, req.path, rec.Code)
		}
	}
}
