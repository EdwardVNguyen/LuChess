package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func positionPath(noteID int64) string { return notePath(noteID) + "/position" }

// resetPosition asks to reset a Note to a Position; a nil startFEN is the standard start.
func (a *app) resetPosition(s session, noteID int64, startFEN *string, confirm bool) *httptest.ResponseRecorder {
	a.t.Helper()
	path := positionPath(noteID)
	if confirm {
		path += "?confirm=true"
	}
	return a.send(http.MethodPut, path, toJSON(map[string]any{"startFen": startFEN}), withBearer(s.AccessToken))
}

type resetConflictResponse struct {
	Error    string `json:"error"`
	Moves    int    `json:"moves"`
	Comments int    `json:"comments"`
	Bodies   int    `json:"bodies"`
	Glyphs   int    `json:"glyphs"`
	Drawings int    `json:"drawings"`
}

func TestResettingANoteWithNothingToLoseNeedsNoConfirmation(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	created := a.createNote(s, `{"name":"Untitled"}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: status = %d (body %s)", created.Code, created.Body)
	}
	var n noteResponse
	decodeInto(t, created, &n)
	fen := sampleFEN

	a.clock.Advance(time.Minute)
	rec := a.resetPosition(s, n.ID, &fen, false)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
	}
	var got noteResponse
	decodeInto(t, rec, &got)
	if got.ID != n.ID || got.Name != "Untitled" || got.StartFEN == nil || *got.StartFEN != fen {
		t.Fatalf("note = %+v", got)
	}
	if !got.UpdatedAt.Equal(a.clock.Now()) || !got.CreatedAt.Equal(n.CreatedAt) {
		t.Fatalf("timestamps = %v / %v", got.CreatedAt, got.UpdatedAt)
	}
	if moves := a.moves(s, n.ID); len(moves) != 1 || moves[0].ParentID != nil {
		t.Fatalf("moves = %+v", moves)
	}
}

func TestResettingANoteWithMovesOrWritingNeedsConfirmation(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	folder := a.mustCreateFolder(s, "Openings", nil)
	n := a.mustCreateNote(s, "Italian", playersTags, nil)
	a.mustFileNote(s, n.ID, &folder.ID)
	target := a.mustCreateNote(s, "Target", sampleTags, nil)
	linker := a.mustCreateNote(s, "Linker", sampleTags, nil)
	// Writing on the Position and on Moves, with Links in it.
	a.mustWriteOnLine(s, n.ID, 0, map[string]any{"body": "Opens with " + link(target.ID, ""), "positionGlyph": "=", "drawings": []map[string]any{{"from": "e4", "brush": "green"}}})
	a.mustWriteOnLine(s, n.ID, 3, map[string]any{"comment": "Develops. " + link(target.ID, "see"), "moveGlyph": "!"})
	a.mustAddMove(s, n.ID, a.lineMove(s, n.ID, 1).ID, "c5")
	// A Link from another Note to this one stays.
	a.mustWriteOnLine(s, linker.ID, 0, map[string]any{"body": "See " + link(n.ID, "")})
	before := a.getNote(s, n.ID)
	fen := sampleFEN

	a.clock.Advance(time.Minute)
	rec := a.resetPosition(s, n.ID, &fen, false)
	if rec.Code != http.StatusConflict {
		t.Fatalf("unconfirmed reset: status = %d, want 409 (body %s)", rec.Code, rec.Body)
	}
	var conflict resetConflictResponse
	decodeInto(t, rec, &conflict)
	want := resetConflictResponse{
		Error: "This will delete 7 Moves, 1 Comment, 1 Body, 2 Glyphs and 1 Drawing",
		Moves: 7, Comments: 1, Bodies: 1, Glyphs: 2, Drawings: 1,
	}
	if conflict != want {
		t.Fatalf("conflict = %+v, want %+v", conflict, want)
	}
	if got := a.getNote(s, n.ID); got.StartFEN != nil || !got.UpdatedAt.Equal(before.UpdatedAt) || len(got.Tags) != 3 {
		t.Fatalf("refused reset changed the note: %+v", got)
	}
	if len(a.moves(s, n.ID)) != 8 {
		t.Fatal("refused reset changed the moves")
	}

	rec = a.resetPosition(s, n.ID, &fen, true)
	if rec.Code != http.StatusOK {
		t.Fatalf("confirmed reset: status = %d (body %s)", rec.Code, rec.Body)
	}
	var got noteResponse
	decodeInto(t, rec, &got)
	// The name, Folder and id stay; the Position changes and the PGN tags go.
	if got.ID != n.ID || got.Name != "Italian" || got.StartFEN == nil || *got.StartFEN != fen || len(got.Tags) != 0 {
		t.Fatalf("note = %+v", got)
	}
	if folders := a.notesWithFolders(s); folders["Italian"] == nil || *folders["Italian"] != folder.ID {
		t.Fatalf("folder = %v", folders["Italian"])
	}
	// Every Move goes, and the Position's own writing.
	moves := a.moves(s, n.ID)
	if len(moves) != 1 {
		t.Fatalf("moves = %+v", moves)
	}
	root := moves[0]
	if root.ParentID != nil || root.Comment != nil || root.Body != nil || root.PositionGlyph != nil || len(root.Drawings) != 0 {
		t.Fatalf("root = %+v", root)
	}
	// The Links inside the writing go; the Links to this Note stay.
	if b := a.links(s, target.ID).Backlinks; len(b) != 0 {
		t.Fatalf("backlinks from deleted writing = %+v", b)
	}
	if b := a.links(s, n.ID).Backlinks; len(b) != 1 || b[0].NoteID != linker.ID {
		t.Fatalf("backlinks to the reset note = %+v", b)
	}
	// Search no longer finds it by the old game's players.
	if found := a.search(s, "Lovelace"); len(found) != 0 {
		t.Fatalf("search by old players = %+v", found)
	}
	// A new tree grows from the new Position.
	a.mustAddMove(s, n.ID, root.ID, "Kd2")
}

func TestResettingCountsMovesWithNoWriting(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)

	rec := a.resetPosition(s, n.ID, nil, false)
	if rec.Code != http.StatusConflict || errorOf(t, rec) != "This will delete 6 Moves" {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}
}

func TestResettingToTheStandardStart(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	fen := sampleFEN
	n := a.mustCreateNote(s, "King and pawn", tags{{"SetUp", "1"}, {"FEN", fen}}, &fen)

	rec := a.resetPosition(s, n.ID, nil, false)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}
	var got noteResponse
	decodeInto(t, rec, &got)
	if got.StartFEN != nil || len(got.Tags) != 0 {
		t.Fatalf("note = %+v", got)
	}
}

func TestResetRejectsABadFEN(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	bad := "not a fen"

	if rec := a.resetPosition(s, n.ID, &bad, true); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
	}
	if len(a.moves(s, n.ID)) != 7 {
		t.Fatal("a rejected reset changed the moves")
	}
}

func TestAnotherUsersNoteCannotBeReset(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")
	n := a.mustCreateNote(ada, "Private", sampleTags, nil)

	if rec := a.resetPosition(bob, n.ID, nil, true); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %s)", rec.Code, rec.Body)
	}
	if len(a.moves(ada, n.ID)) != 7 {
		t.Fatal("another user reset the note")
	}
	if rec := a.send(http.MethodPut, positionPath(n.ID), "{}"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("no auth: status = %d, want 401", rec.Code)
	}
}
