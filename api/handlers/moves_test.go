package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"
)

const (
	longPGN   = "[Event \"Casual\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *"
	editedPGN = "[Event \"Casual\"]\n\n1. e4 e5 2. Nf3 Nf6 *"
)

func movesPath(id int64) string { return fmt.Sprintf("/api/notes/%d/moves", id) }

func movesBody(pgn string, firstChangedPly int, confirm bool) string {
	b, _ := json.Marshal(map[string]any{"pgn": pgn, "firstChangedPly": firstChangedPly, "confirm": confirm})
	return string(b)
}

func (a *app) editMoves(s session, noteID int64, pgn string, firstChangedPly int, confirm bool) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodPut, movesPath(noteID), movesBody(pgn, firstChangedPly, confirm), withBearer(s.AccessToken))
}

func (a *app) getNote(s session, id int64) noteResponse {
	a.t.Helper()
	rec := a.send(http.MethodGet, notePath(id), "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("get note: status = %d (body %s)", rec.Code, rec.Body)
	}
	var n noteResponse
	decodeInto(a.t, rec, &n)
	return n
}

func plyNumbers(plies []plyResponse) []int {
	out := []int{}
	for _, p := range plies {
		out = append(out, p.Ply)
	}
	return out
}

type conflictResponse struct {
	Error string `json:"error"`
	Plies int    `json:"plies"`
}

func TestEditMovesWithNothingWrittenLaterNeedsNoConfirmation(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", longPGN, nil)
	a.mustPutPly(s, n.ID, 0, map[string]any{"body": "The big idea."})
	a.mustPutPly(s, n.ID, 3, map[string]any{"comment": "Develops.", "moveGlyph": "!"})

	a.clock.Advance(time.Minute)
	// Replace 2…Nc6 with 2…Nf6, then delete the last move: neither touches writing.
	for _, edit := range []struct {
		pgn  string
		from int
	}{{editedPGN, 4}, {"[Event \"Casual\"]\n\n1. e4 e5 2. Nf3 *", 4}} {
		rec := a.editMoves(s, n.ID, edit.pgn, edit.from, false)
		if rec.Code != http.StatusOK {
			t.Fatalf("edit from %d: status = %d (body %s)", edit.from, rec.Code, rec.Body)
		}
		var got noteResponse
		decodeInto(t, rec, &got)
		if got.PGN != edit.pgn || !got.UpdatedAt.Equal(a.clock.Now()) {
			t.Fatalf("edited note = %+v", got)
		}
	}
	if got := plyNumbers(a.listPlies(s, n.ID)); !slices.Equal(got, []int{0, 3}) {
		t.Fatalf("plies = %v, want [0 3]", got)
	}
}

func TestEditMovesThatWouldDeleteWritingNeedsConfirmation(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", longPGN, nil)
	a.mustPutPly(s, n.ID, 0, map[string]any{"body": "The big idea.", "positionGlyph": "="})
	a.mustPutPly(s, n.ID, 3, map[string]any{"comment": "Develops.", "body": "Then Black must decide."})
	a.mustPutPly(s, n.ID, 4, map[string]any{"comment": "The natural reply."})
	a.mustPutPly(s, n.ID, 5, map[string]any{"moveGlyph": "!?"})
	a.mustPutPly(s, n.ID, 6, map[string]any{"body": "The Giuoco Piano."})
	before := a.getNote(s, n.ID)

	// Replacing 2…Nc6 would delete the writing on plies 4 and 6 and the Glyph on 5.
	a.clock.Advance(time.Minute)
	rec := a.editMoves(s, n.ID, editedPGN, 4, false)
	if rec.Code != http.StatusConflict {
		t.Fatalf("unconfirmed edit: status = %d, want 409 (body %s)", rec.Code, rec.Body)
	}
	var conflict conflictResponse
	decodeInto(t, rec, &conflict)
	if conflict.Plies != 3 || conflict.Error != "This will delete your writing on 3 moves" {
		t.Fatalf("conflict = %+v", conflict)
	}
	if got := a.getNote(s, n.ID); got.PGN != longPGN || !got.UpdatedAt.Equal(before.UpdatedAt) {
		t.Fatalf("note changed by a refused edit: %+v", got)
	}
	if got := plyNumbers(a.listPlies(s, n.ID)); !slices.Equal(got, []int{0, 3, 4, 5, 6}) {
		t.Fatalf("plies after refused edit = %v", got)
	}

	rec = a.editMoves(s, n.ID, editedPGN, 4, true)
	if rec.Code != http.StatusOK {
		t.Fatalf("confirmed edit: status = %d (body %s)", rec.Code, rec.Body)
	}
	if got := a.getNote(s, n.ID); got.PGN != editedPGN || !got.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("note after confirmed edit = %+v", got)
	}
	plies := a.listPlies(s, n.ID)
	if got := plyNumbers(plies); !slices.Equal(got, []int{0, 3}) {
		t.Fatalf("plies after confirmed edit = %v, want [0 3]", got)
	}
	// Writing before the changed Ply is untouched.
	if str(plies[0].Body) != "The big idea." || str(plies[0].PositionGlyph) != "=" ||
		str(plies[1].Comment) != "Develops." || str(plies[1].Body) != "Then Black must decide." {
		t.Fatalf("kept writing changed: %+v", plies)
	}
}

func TestEditMovesCountsOneMoveInTheSingular(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", longPGN, nil)
	a.mustPutPly(s, n.ID, 6, map[string]any{"positionGlyph": "±"})

	rec := a.editMoves(s, n.ID, "[Event \"Casual\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 *", 6, false)
	var conflict conflictResponse
	decodeInto(t, rec, &conflict)
	if rec.Code != http.StatusConflict || conflict.Plies != 1 || conflict.Error != "This will delete your writing on 1 move" {
		t.Fatalf("status = %d, conflict = %+v", rec.Code, conflict)
	}
}

func TestEditMovesDeletesTheLinksInDeletedWritingAndTheirBacklinks(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", longPGN, nil)
	kept := a.mustCreateNote(s, "Kept", samplePGN, nil)
	gone := a.mustCreateNote(s, "Gone", samplePGN, nil)
	both := a.mustCreateNote(s, "Both", samplePGN, nil)

	a.mustPutPly(s, n.ID, 3, map[string]any{"comment": "See " + link(kept.ID, "") + " and " + link(both.ID, "") + "."})
	a.mustPutPly(s, n.ID, 4, map[string]any{"comment": "See " + link(gone.ID, "") + "."})
	a.mustPutPly(s, n.ID, 6, map[string]any{"body": "Again " + link(both.ID, "") + " and " + link(gone.ID, "") + "."})

	if rec := a.editMoves(s, n.ID, editedPGN, 4, true); rec.Code != http.StatusOK {
		t.Fatalf("confirmed edit: status = %d (body %s)", rec.Code, rec.Body)
	}

	if got := targetIDs(a.links(s, n.ID)); !slices.Equal(got, []int64{kept.ID, both.ID}) {
		t.Fatalf("targets = %v, want [%d %d]", got, kept.ID, both.ID)
	}
	if got := a.links(s, gone.ID).Backlinks; len(got) != 0 {
		t.Fatalf("backlinks of a Note only linked from deleted writing = %+v", got)
	}
	if got := a.links(s, both.ID).Backlinks; len(got) != 1 || got[0].Ply != 3 || got[0].Part != "comment" {
		t.Fatalf("backlinks of a Note linked before and after the change = %+v", got)
	}
	if got := a.links(s, kept.ID).Backlinks; len(got) != 1 || got[0].NoteID != n.ID || got[0].Ply != 3 {
		t.Fatalf("backlinks of a Note linked before the change = %+v", got)
	}
}

func TestEditMovesOnAnotherUsersNoteIsNotFound(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")
	n := a.mustCreateNote(ada, "Private", longPGN, nil)
	a.mustPutPly(ada, n.ID, 6, map[string]any{"comment": "Mine."})

	for _, confirm := range []bool{false, true} {
		if rec := a.editMoves(bob, n.ID, editedPGN, 4, confirm); rec.Code != http.StatusNotFound {
			t.Fatalf("confirm %v: status = %d, want 404 (body %s)", confirm, rec.Code, rec.Body)
		}
	}
	for _, id := range []string{"abc", "0", "999999"} {
		rec := a.send(http.MethodPut, "/api/notes/"+id+"/moves", movesBody(editedPGN, 4, true), withBearer(ada.AccessToken))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("id %q: status = %d, want 404", id, rec.Code)
		}
	}
	if got := a.getNote(ada, n.ID); got.PGN != longPGN {
		t.Fatalf("Ada's moves changed: %q", got.PGN)
	}
	if got := plyNumbers(a.listPlies(ada, n.ID)); !slices.Equal(got, []int{6}) {
		t.Fatalf("Ada's plies = %v", got)
	}
}

func TestEditMovesRejectsBadInput(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", longPGN, nil)
	a.mustPutPly(s, n.ID, 4, map[string]any{"comment": "Kept."})

	cases := map[string]string{
		"empty PGN":      movesBody("  ", 4, true),
		"ply 0":          movesBody(editedPGN, 0, true),
		"negative ply":   movesBody(editedPGN, -1, true),
		"ply too large":  movesBody(editedPGN, 10_001, true),
		"no ply":         `{"pgn":"1. e4 *","confirm":true}`,
		"not JSON":       `pgn=1.e4`,
		"ply not number": `{"pgn":"1. e4 *","firstChangedPly":"4","confirm":true}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			rec := a.send(http.MethodPut, movesPath(n.ID), body, withBearer(s.AccessToken))
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
			}
		})
	}
	if got := plyNumbers(a.listPlies(s, n.ID)); !slices.Equal(got, []int{4}) {
		t.Fatalf("plies after bad edits = %v", got)
	}
}

func TestEditMovesRequiresAuth(t *testing.T) {
	a := newApp(t)
	if rec := a.send(http.MethodPut, "/api/notes/1/moves", movesBody(editedPGN, 4, true)); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}
