package handler_test

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"
)

func treePath(noteID int64) string { return notePath(noteID) + "/tree" }

// applyTree applies a tree read from a PGN to a Note with the same Position.
func (a *app) applyTree(s session, noteID int64, body map[string]any, confirm bool) *httptest.ResponseRecorder {
	a.t.Helper()
	path := treePath(noteID)
	if confirm {
		path += "?confirm=true"
	}
	return a.send(http.MethodPut, path, toJSON(body), withBearer(s.AccessToken))
}

type treeApplied struct {
	Note  noteResponse   `json:"note"`
	Moves []moveResponse `json:"moves"`
}

func (a *app) mustApplyTree(s session, noteID int64, body map[string]any, confirm bool) treeApplied {
	a.t.Helper()
	rec := a.applyTree(s, noteID, body, confirm)
	if rec.Code != http.StatusOK {
		a.t.Fatalf("apply tree: status = %d (body %s)", rec.Code, rec.Body)
	}
	var got treeApplied
	decodeInto(a.t, rec, &got)
	return got
}

type treeConflictResponse struct {
	Error    string `json:"error"`
	Moves    int    `json:"moves"`
	Comments int    `json:"comments"`
	Bodies   int    `json:"bodies"`
	Glyphs   int    `json:"glyphs"`
	Drawings int    `json:"drawings"`
	Links    int    `json:"links"`
}

// keptLine is a Main line as an applied PGN gives it, every Move's writing
// shown unchanged, so whatever is stored is kept.
func keptLine(sans []string) []map[string]any {
	moves := lineMoves(sans)
	for _, m := range moves {
		m["keepComment"] = true
		m["keepBody"] = true
	}
	return moves
}

func ids(moves []moveResponse) map[string]int64 {
	out := map[string]int64{}
	for _, m := range moves {
		out[str(m.SAN)] = m.ID
	}
	return out
}

func TestApplyingAPGNThatAddsAMoveChangesNothingElse(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	target := a.mustCreateNote(s, "Target", sampleTags, nil)
	a.mustWriteOnLine(s, n.ID, 0, map[string]any{"body": "The idea", "positionGlyph": "="})
	a.mustWriteOnLine(s, n.ID, 3, map[string]any{"comment": "See " + link(target.ID, ""), "moveGlyph": "!", "drawings": []map[string]any{{"from": "c4", "brush": "red"}, {"from": "f3", "to": "e5", "brush": "green"}}})
	before := a.moves(s, n.ID)

	a.clock.Advance(time.Minute)
	// The PGN shows the Glyph and Drawings again, with the circle written first.
	line := keptLine(append(slices.Clone(sampleLine), "c3"))
	line[2]["moveGlyph"] = "!"
	line[2]["drawings"] = []map[string]any{{"from": "c4", "brush": "red"}, {"from": "f3", "to": "e5", "brush": "green"}}
	got := a.mustApplyTree(s, n.ID, map[string]any{
		"tags":     tags{{"Event", "Casual"}, {"White", "Lovelace, Ada"}},
		"position": map[string]any{"positionGlyph": "=", "keepComment": true, "keepBody": true},
		"moves":    line,
	}, false)

	if got.Note.Name != "Italian" || len(got.Note.Tags) != 2 || !got.Note.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("note = %+v", got.Note)
	}
	if want := append(slices.Clone(sampleLine), "c3"); !slices.Equal(mainLine(got.Moves), want) {
		t.Fatalf("main line = %v, want %v", mainLine(got.Moves), want)
	}
	// Every Move stays as it was, with its id and writing; the Link too.
	for _, old := range before {
		var now *moveResponse
		for i := range got.Moves {
			if got.Moves[i].ID == old.ID {
				now = &got.Moves[i]
			}
		}
		if now == nil || str(now.Comment) != str(old.Comment) || str(now.Body) != str(old.Body) ||
			str(now.MoveGlyph) != str(old.MoveGlyph) || len(now.Drawings) != len(old.Drawings) || !now.UpdatedAt.Equal(old.UpdatedAt) {
			t.Fatalf("move %s changed: %+v, was %+v", str(old.SAN), now, old)
		}
	}
	if b := a.links(s, target.ID).Backlinks; len(b) != 1 {
		t.Fatalf("backlinks = %+v", b)
	}
	if found := a.search(s, "Lovelace"); len(found) != 1 || found[0].ID != n.ID {
		t.Fatalf("search by the new tags = %+v", found)
	}
}

func TestApplyingAPGNThatChangesAMoveReplacesTheRestOfItsLine(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	// Writing before the change, after it, and in a Variation elsewhere.
	a.mustWriteOnLine(s, n.ID, 2, map[string]any{"comment": "Natural"})
	a.mustWriteOnLine(s, n.ID, 5, map[string]any{"comment": "Italian", "body": "Bishops", "moveGlyph": "!?"})
	a.mustWriteOnLine(s, n.ID, 6, map[string]any{"drawings": []map[string]any{{"from": "c5", "brush": "blue"}}})
	sicilian := a.mustAddMove(s, n.ID, a.lineMove(s, n.ID, 1).ID, "c5")
	a.mustWriteOn(s, n.ID, sicilian.ID, map[string]any{"comment": "Sharper"})
	before := ids(a.moves(s, n.ID))

	// 3. Bb5 in place of 3. Bc4, and the Sicilian kept as a Variation.
	line := keptLine([]string{"e4", "e5", "Nf3", "Nc6", "Bb5", "a6"})
	line = append(line, map[string]any{"parent": 0, "san": "c5", "keepComment": true, "keepBody": true})
	body := map[string]any{"tags": sampleTags, "position": map[string]any{}, "moves": line}

	rec := a.applyTree(s, n.ID, body, false)
	if rec.Code != http.StatusConflict {
		t.Fatalf("unconfirmed: status = %d, want 409 (body %s)", rec.Code, rec.Body)
	}
	var conflict treeConflictResponse
	decodeInto(t, rec, &conflict)
	want := treeConflictResponse{
		Error: "This will delete 2 Moves, 1 Comment, 1 Body, 1 Glyph and 1 Drawing",
		Moves: 2, Comments: 1, Bodies: 1, Glyphs: 1, Drawings: 1,
	}
	if conflict != want {
		t.Fatalf("conflict = %+v, want %+v", conflict, want)
	}
	if got := ids(a.moves(s, n.ID)); len(got) != len(before) {
		t.Fatal("a refused apply changed the moves")
	}

	got := a.mustApplyTree(s, n.ID, body, true)
	if want := []string{"e4", "e5", "Nf3", "Nc6", "Bb5", "a6"}; !slices.Equal(mainLine(got.Moves), want) {
		t.Fatalf("main line = %v, want %v", mainLine(got.Moves), want)
	}
	after := ids(got.Moves)
	for _, san := range []string{"e4", "e5", "Nf3", "Nc6", "c5"} {
		if after[san] != before[san] {
			t.Fatalf("%s: id %d, was %d", san, after[san], before[san])
		}
	}
	if _, ok := after["Bc4"]; ok {
		t.Fatal("Bc4 is still there")
	}
	for _, m := range got.Moves {
		switch str(m.SAN) {
		case "e5":
			if str(m.Comment) != "Natural" {
				t.Fatalf("e5 lost its Comment: %+v", m)
			}
		case "c5":
			if str(m.Comment) != "Sharper" || *m.ParentID != before["e4"] {
				t.Fatalf("c5 = %+v", m)
			}
		}
	}
}

func TestApplyingAPGNWithAChangedCommentReplacesItAndItsLinks(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	target := a.mustCreateNote(s, "Target", sampleTags, nil)
	other := a.mustCreateNote(s, "Other", sampleTags, nil)
	// A changed Comment loses its Link; an unchanged Body keeps its own.
	a.mustWriteOnLine(s, n.ID, 1, map[string]any{"comment": "See " + link(target.ID, "this"), "body": "And " + link(other.ID, "")})

	line := keptLine(sampleLine)
	line[0]["comment"] = "See this, again"
	line[0]["keepComment"] = false
	line[0]["body"] = "And Other"
	body := map[string]any{"tags": sampleTags, "position": map[string]any{}, "moves": line}

	rec := a.applyTree(s, n.ID, body, false)
	var conflict treeConflictResponse
	decodeInto(t, rec, &conflict)
	want := treeConflictResponse{Error: "This will delete 1 Comment; 1 Link becomes plain text", Comments: 1, Links: 1}
	if rec.Code != http.StatusConflict || conflict != want {
		t.Fatalf("status = %d, conflict = %+v, want %+v", rec.Code, conflict, want)
	}

	got := a.mustApplyTree(s, n.ID, body, true)
	e4 := got.Moves[1]
	if str(e4.Comment) != "See this, again" || str(e4.Body) != "And "+link(other.ID, "") {
		t.Fatalf("e4 = %+v", e4)
	}
	if b := a.links(s, target.ID).Backlinks; len(b) != 0 {
		t.Fatalf("backlinks from the replaced Comment = %+v", b)
	}
	if b := a.links(s, other.ID).Backlinks; len(b) != 1 {
		t.Fatalf("backlinks from the kept Body = %+v", b)
	}
}

func TestApplyingAPGNThatDeletesMovesWithNoWritingStillAsks(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	body := map[string]any{"tags": sampleTags, "position": map[string]any{}, "moves": keptLine(sampleLine[:4])}

	rec := a.applyTree(s, n.ID, body, false)
	if rec.Code != http.StatusConflict || errorOf(t, rec) != "This will delete 2 Moves" {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}
	if got := a.mustApplyTree(s, n.ID, body, true); !slices.Equal(mainLine(got.Moves), sampleLine[:4]) {
		t.Fatalf("main line = %v", mainLine(got.Moves))
	}
}

func TestApplyingAPGNReordersVariationsWithoutAsking(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	e4 := a.lineMove(s, n.ID, 1)
	c5 := a.mustAddMove(s, n.ID, e4.ID, "c5")
	a.mustWriteOn(s, n.ID, c5.ID, map[string]any{"comment": "Sicilian"})

	// 1. e4 c5 (1... e5 2. Nf3 …): the Sicilian is now the Main line.
	moves := []map[string]any{
		{"parent": nil, "san": "e4"},
		{"parent": 0, "san": "c5", "keepComment": true},
	}
	for i, san := range sampleLine[1:] {
		parent := 0
		if i > 0 {
			parent = len(moves) - 1
		}
		moves = append(moves, map[string]any{"parent": parent, "san": san})
	}
	got := a.mustApplyTree(s, n.ID, map[string]any{"tags": sampleTags, "position": map[string]any{}, "moves": moves}, false)

	if want := []string{"e4", "c5"}; !slices.Equal(mainLine(got.Moves), want) {
		t.Fatalf("main line = %v, want %v", mainLine(got.Moves), want)
	}
	after := children(got.Moves, e4.ID)
	if len(after) != 2 || after[0].ID != c5.ID || str(after[0].Comment) != "Sicilian" || str(after[1].SAN) != "e5" {
		t.Fatalf("e4's children = %+v", after)
	}
	if len(got.Moves) != 8 {
		t.Fatalf("%d moves, want 8", len(got.Moves))
	}
}

func TestApplyTreeRejectsABadTree(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	cases := map[string]map[string]any{
		"parent after the move": {"moves": []map[string]any{{"parent": 0, "san": "e4"}}},
		"bad SAN":               {"moves": []map[string]any{{"parent": nil, "san": "e4!"}}},
		"repeated SAN":          {"moves": []map[string]any{{"parent": nil, "san": "e4"}, {"parent": nil, "san": "e4"}}},
		"move Glyph at root":    {"position": map[string]any{"moveGlyph": "!"}},
		"bad tag":               {"tags": tags{{"Bad name", "x"}}},
		"foreign link":          {"moves": []map[string]any{{"parent": nil, "san": "d4", "comment": link(999999, "")}}},
	}
	for name, body := range cases {
		if rec := a.applyTree(s, n.ID, body, true); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400 (body %s)", name, rec.Code, rec.Body)
		}
	}
	if !slices.Equal(mainLine(a.moves(s, n.ID)), sampleLine) {
		t.Fatal("a rejected apply changed the moves")
	}
}

func TestAnotherUsersNoteCannotHaveATreeApplied(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")
	n := a.mustCreateNote(ada, "Private", sampleTags, nil)

	if rec := a.applyTree(bob, n.ID, map[string]any{}, true); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %s)", rec.Code, rec.Body)
	}
	if len(a.moves(ada, n.ID)) != 7 {
		t.Fatal("another user changed the note")
	}
	if rec := a.send(http.MethodPut, treePath(n.ID), "{}"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("no auth: status = %d, want 401", rec.Code)
	}
}

func TestResettingWithAPGNImportsItsTreeAndTags(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", playersTags, nil)
	fen := sampleFEN
	body := toJSON(map[string]any{
		"startFen": fen,
		"tags":     tags{{"SetUp", "1"}, {"FEN", fen}, {"White", "Turing, Alan"}},
		"position": map[string]any{"body": "Opposition"},
		"moves":    []map[string]any{{"parent": nil, "san": "Kd2", "comment": "Up"}, {"parent": 0, "san": "Kd5"}},
	})

	if rec := a.send(http.MethodPut, positionPath(n.ID), body, withBearer(s.AccessToken)); rec.Code != http.StatusConflict {
		t.Fatalf("unconfirmed: status = %d, want 409 (body %s)", rec.Code, rec.Body)
	}
	rec := a.send(http.MethodPut, positionPath(n.ID)+"?confirm=true", body, withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}
	var got noteResponse
	decodeInto(t, rec, &got)
	if got.Name != "Italian" || got.StartFEN == nil || *got.StartFEN != fen || len(got.Tags) != 3 {
		t.Fatalf("note = %+v", got)
	}
	moves := a.moves(s, n.ID)
	if !slices.Equal(mainLine(moves), []string{"Kd2", "Kd5"}) || str(moves[0].Body) != "Opposition" || str(moves[1].Comment) != "Up" {
		t.Fatalf("moves = %+v", moves)
	}
	if found := a.search(s, "Turing"); len(found) != 1 {
		t.Fatalf("search by the new tags = %+v", found)
	}
}
