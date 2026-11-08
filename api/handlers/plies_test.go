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

type plyResponse struct {
	Ply           int       `json:"ply"`
	Comment       *string   `json:"comment"`
	Body          *string   `json:"body"`
	MoveGlyph     *string   `json:"moveGlyph"`
	PositionGlyph *string   `json:"positionGlyph"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func plyPath(noteID int64, ply int) string { return fmt.Sprintf("/api/notes/%d/plies/%d", noteID, ply) }

func plyBody(fields map[string]any) string {
	b, _ := json.Marshal(fields)
	return string(b)
}

func (a *app) putPly(s session, noteID int64, ply int, fields map[string]any) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodPut, plyPath(noteID, ply), plyBody(fields), withBearer(s.AccessToken))
}

func (a *app) mustPutPly(s session, noteID int64, ply int, fields map[string]any) plyResponse {
	a.t.Helper()
	rec := a.putPly(s, noteID, ply, fields)
	if rec.Code != http.StatusOK {
		a.t.Fatalf("put ply %d: status = %d (body %s)", ply, rec.Code, rec.Body)
	}
	var p plyResponse
	decodeInto(a.t, rec, &p)
	return p
}

func (a *app) listPlies(s session, noteID int64) []plyResponse {
	a.t.Helper()
	rec := a.send(http.MethodGet, fmt.Sprintf("/api/notes/%d/plies", noteID), "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list plies: status = %d (body %s)", rec.Code, rec.Body)
	}
	var plies []plyResponse
	decodeInto(a.t, rec, &plies)
	return plies
}

func str(p *string) string {
	if p == nil {
		return "<nil>"
	}
	return *p
}

func TestWriteEditAndDeleteCommentsAndBodies(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", samplePGN, nil)

	if got := a.listPlies(s, n.ID); len(got) != 0 {
		t.Fatalf("new note plies = %+v, want none", got)
	}

	a.mustPutPly(s, n.ID, 0, map[string]any{"body": "  The big idea.  "})
	a.mustPutPly(s, n.ID, 3, map[string]any{"comment": "Develops.", "body": "Then Black must decide."})

	got := a.listPlies(s, n.ID)
	if len(got) != 2 || got[0].Ply != 0 || str(got[0].Body) != "The big idea." || got[0].Comment != nil {
		t.Fatalf("plies = %+v", got)
	}
	if got[1].Ply != 3 || str(got[1].Comment) != "Develops." || str(got[1].Body) != "Then Black must decide." {
		t.Fatalf("ply 3 = %+v", got[1])
	}

	a.clock.Advance(time.Minute)
	edited := a.mustPutPly(s, n.ID, 3, map[string]any{"comment": "Develops a piece.", "body": ""})
	if str(edited.Comment) != "Develops a piece." || edited.Body != nil || !edited.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("edited = %+v", edited)
	}

	// Clearing everything on a Ply deletes its writing.
	a.mustPutPly(s, n.ID, 3, map[string]any{})
	got = a.listPlies(s, n.ID)
	if len(got) != 1 || got[0].Ply != 0 {
		t.Fatalf("after delete plies = %+v", got)
	}
}

func TestWritingUpdatesTheNote(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", samplePGN, nil)

	a.clock.Advance(time.Minute)
	a.mustPutPly(s, n.ID, 1, map[string]any{"comment": "Best by test."})
	if got := a.listNotes(s)[0]; !got.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("note updatedAt = %v, want %v", got.UpdatedAt, a.clock.Now())
	}
}

func TestGlyphsOneOfEachKindPerPly(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", samplePGN, nil)

	p := a.mustPutPly(s, n.ID, 2, map[string]any{"moveGlyph": "!?", "positionGlyph": "⩲"})
	if str(p.MoveGlyph) != "!?" || str(p.PositionGlyph) != "⩲" {
		t.Fatalf("ply = %+v", p)
	}

	// Setting a Glyph of the same kind replaces the first.
	a.mustPutPly(s, n.ID, 2, map[string]any{"moveGlyph": "??", "positionGlyph": "−+"})
	got := a.listPlies(s, n.ID)
	if len(got) != 1 || str(got[0].MoveGlyph) != "??" || str(got[0].PositionGlyph) != "−+" {
		t.Fatalf("plies = %+v", got)
	}

	a.mustPutPly(s, n.ID, 2, map[string]any{"positionGlyph": "−+"})
	got = a.listPlies(s, n.ID)
	if got[0].MoveGlyph != nil || str(got[0].PositionGlyph) != "−+" {
		t.Fatalf("after clearing move glyph = %+v", got[0])
	}

	// Ply 0 takes a position Glyph.
	a.mustPutPly(s, n.ID, 0, map[string]any{"positionGlyph": "="})
}

func TestPlyRejectsBadInput(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", samplePGN, nil)
	long := strings.Repeat("é", 20_001)

	cases := map[string]struct {
		ply     int
		fields  map[string]any
		message string
	}{
		"move glyph on ply 0": {0, map[string]any{"moveGlyph": "!"}, "Ply 0 is the Position, so it cannot have a move Glyph"},
		"unknown move glyph":  {1, map[string]any{"moveGlyph": "!!!"}, "The move Glyph must be one of !! ! !? ?! ? ??"},
		"position as move":    {1, map[string]any{"moveGlyph": "±"}, "The move Glyph must be one of !! ! !? ?! ? ??"},
		"unknown position":    {1, map[string]any{"positionGlyph": "+-"}, "The position Glyph must be one of +− ± ⩲ = ∞ ⩱ ∓ −+"},
		"long comment":        {1, map[string]any{"comment": long}, "Comment must be at most 20,000 characters"},
		"long body":           {1, map[string]any{"body": long}, "Body must be at most 20,000 characters"},
		"negative ply":        {-1, map[string]any{"comment": "x"}, "Ply must be a whole number from 0 to 10000"},
		"huge ply":            {10_001, map[string]any{"comment": "x"}, "Ply must be a whole number from 0 to 10000"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			rec := a.putPly(s, n.ID, c.ply, c.fields)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
			}
			var e struct {
				Error string `json:"error"`
			}
			decodeInto(t, rec, &e)
			if e.Error != c.message {
				t.Fatalf("error = %q, want %q", e.Error, c.message)
			}
		})
	}

	// Exactly at the cap is fine.
	a.mustPutPly(s, n.ID, 1, map[string]any{"comment": strings.Repeat("é", 20_000), "body": strings.Repeat("é", 20_000)})
}

func TestAnotherUsersPliesAreNotFound(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")
	n := a.mustCreateNote(ada, "Private", samplePGN, nil)
	a.mustPutPly(ada, n.ID, 1, map[string]any{"comment": "Mine.", "moveGlyph": "!"})

	if rec := a.send(http.MethodGet, fmt.Sprintf("/api/notes/%d/plies", n.ID), "", withBearer(bob.AccessToken)); rec.Code != http.StatusNotFound {
		t.Fatalf("list: status = %d, want 404 (body %s)", rec.Code, rec.Body)
	}
	for name, fields := range map[string]map[string]any{
		"edit":   {"comment": "Bob's now."},
		"delete": {},
	} {
		if rec := a.putPly(bob, n.ID, 1, fields); rec.Code != http.StatusNotFound {
			t.Fatalf("%s: status = %d, want 404 (body %s)", name, rec.Code, rec.Body)
		}
	}
	if rec := a.putPly(ada, 999999, 1, map[string]any{"comment": "x"}); rec.Code != http.StatusNotFound {
		t.Fatalf("missing note: status = %d, want 404", rec.Code)
	}

	got := a.listPlies(ada, n.ID)
	if len(got) != 1 || str(got[0].Comment) != "Mine." || str(got[0].MoveGlyph) != "!" {
		t.Fatalf("Ada's plies changed: %+v", got)
	}
}

func TestDeletingANoteDeletesItsWriting(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", samplePGN, nil)
	a.mustPutPly(s, n.ID, 1, map[string]any{"comment": "Gone soon."})

	if rec := a.send(http.MethodDelete, notePath(n.ID), "", withBearer(s.AccessToken)); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d", rec.Code)
	}
	var count int
	if err := a.db.QueryRow("SELECT count(*) FROM plies").Scan(&count); err != nil || count != 0 {
		t.Fatalf("plies left = %d (err %v)", count, err)
	}
}

func TestPlyEndpointsRequireAuth(t *testing.T) {
	a := newApp(t)
	for _, req := range []struct{ method, path string }{
		{http.MethodGet, "/api/notes/1/plies"},
		{http.MethodPut, "/api/notes/1/plies/0"},
	} {
		if rec := a.send(req.method, req.path, "{}"); rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: status = %d, want 401", req.method, req.path, rec.Code)
		}
	}
}
