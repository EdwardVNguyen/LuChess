package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"
)

type drawingResponse struct {
	From  string  `json:"from"`
	To    *string `json:"to"`
	Brush string  `json:"brush"`
}

type moveResponse struct {
	ID            int64             `json:"id"`
	ParentID      *int64            `json:"parentId"`
	SAN           *string           `json:"san"`
	Comment       *string           `json:"comment"`
	Body          *string           `json:"body"`
	MoveGlyph     *string           `json:"moveGlyph"`
	PositionGlyph *string           `json:"positionGlyph"`
	Drawings      []drawingResponse `json:"drawings"`
	UpdatedAt     time.Time         `json:"updatedAt"`
}

func str(p *string) string {
	if p == nil {
		return "<nil>"
	}
	return *p
}

func toJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func movesPath(noteID int64) string { return fmt.Sprintf("/api/notes/%d/moves", noteID) }

func movePath(noteID, moveID int64) string {
	return fmt.Sprintf("/api/notes/%d/moves/%d", noteID, moveID)
}

func (a *app) moves(s session, noteID int64) []moveResponse {
	a.t.Helper()
	rec := a.send(http.MethodGet, movesPath(noteID), "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list moves: status = %d (body %s)", rec.Code, rec.Body)
	}
	var moves []moveResponse
	decodeInto(a.t, rec, &moves)
	return moves
}

// children lists a Move's children in order; the API lists siblings in order.
func children(moves []moveResponse, parent int64) []moveResponse {
	var out []moveResponse
	for _, m := range moves {
		if m.ParentID != nil && *m.ParentID == parent {
			out = append(out, m)
		}
	}
	return out
}

// mainLine is the SAN of each Move on the Main line, following first children from the root.
func mainLine(moves []moveResponse) []string {
	sans := []string{}
	at := moves[0]
	for {
		next := children(moves, at.ID)
		if len(next) == 0 {
			return sans
		}
		at = next[0]
		sans = append(sans, *at.SAN)
	}
}

// lineMove is the Move at a Ply of the Main line; ply 0 is the root.
func (a *app) lineMove(s session, noteID int64, ply int) moveResponse {
	a.t.Helper()
	moves := a.moves(s, noteID)
	at := moves[0]
	for range ply {
		next := children(moves, at.ID)
		if len(next) == 0 {
			a.t.Fatalf("the Main line has no ply %d", ply)
		}
		at = next[0]
	}
	return at
}

func (a *app) addMove(s session, noteID, parentID int64, san string) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodPost, movesPath(noteID), toJSON(map[string]any{"parentId": parentID, "san": san}), withBearer(s.AccessToken))
}

func (a *app) mustAddMove(s session, noteID, parentID int64, san string) moveResponse {
	a.t.Helper()
	rec := a.addMove(s, noteID, parentID, san)
	if rec.Code != http.StatusCreated {
		a.t.Fatalf("add %s: status = %d (body %s)", san, rec.Code, rec.Body)
	}
	var m moveResponse
	decodeInto(a.t, rec, &m)
	return m
}

func (a *app) writeOn(s session, noteID, moveID int64, fields map[string]any) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodPut, movePath(noteID, moveID)+"/writing", toJSON(fields), withBearer(s.AccessToken))
}

func (a *app) mustWriteOn(s session, noteID, moveID int64, fields map[string]any) moveResponse {
	a.t.Helper()
	rec := a.writeOn(s, noteID, moveID, fields)
	if rec.Code != http.StatusOK {
		a.t.Fatalf("write on move %d: status = %d (body %s)", moveID, rec.Code, rec.Body)
	}
	var m moveResponse
	decodeInto(a.t, rec, &m)
	return m
}

// mustWriteOnLine writes on the Move at a Ply of the Main line, or the Position at ply 0.
func (a *app) mustWriteOnLine(s session, noteID int64, ply int, fields map[string]any) moveResponse {
	a.t.Helper()
	return a.mustWriteOn(s, noteID, a.lineMove(s, noteID, ply).ID, fields)
}

func (a *app) deleteMove(s session, noteID, moveID int64, confirm bool) *httptest.ResponseRecorder {
	a.t.Helper()
	path := movePath(noteID, moveID)
	if confirm {
		path += "?confirm=true"
	}
	return a.send(http.MethodDelete, path, "", withBearer(s.AccessToken))
}

func (a *app) promote(s session, noteID, moveID int64) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodPost, movePath(noteID, moveID)+"/promote", "", withBearer(s.AccessToken))
}

func errorOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var e struct {
		Error string `json:"error"`
	}
	decodeInto(t, rec, &e)
	return e.Error
}

func TestANewNoteHasItsImportedTree(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	to := "e4"
	body := toJSON(map[string]any{
		"name": "Italian",
		"tags": tags{{"Event", "Casual"}, {"White", "Lovelace, Ada"}},
		"position": map[string]any{
			"body": "The big idea.", "positionGlyph": "=",
			"drawings": []map[string]any{{"from": "e2", "to": to, "brush": "green"}},
		},
		// 1. e4 (1. d4 d5) e5 (1… c5 2. Nf3) 2. Nf3
		"moves": []map[string]any{
			{"san": "e4", "comment": "Best by test.", "body": "Then Black must decide.", "moveGlyph": "!"},
			{"san": "d4"},
			{"parent": 1, "san": "d5"},
			{"parent": 0, "san": "e5", "drawings": []map[string]any{{"from": "e5", "brush": "red"}}},
			{"parent": 0, "san": "c5", "comment": "The Sicilian."},
			{"parent": 4, "san": "Nf3"},
			{"parent": 3, "san": "Nf3"},
		},
	})
	rec := a.createNote(s, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: status = %d (body %s)", rec.Code, rec.Body)
	}
	var n noteResponse
	decodeInto(t, rec, &n)

	moves := a.moves(s, n.ID)
	if len(moves) != 8 {
		t.Fatalf("moves = %+v", moves)
	}
	root := moves[0]
	if root.ParentID != nil || str(root.Body) != "The big idea." || str(root.PositionGlyph) != "=" ||
		len(root.Drawings) != 1 || str(root.Drawings[0].To) != "e4" {
		t.Fatalf("root = %+v", root)
	}
	if got := mainLine(moves); !slices.Equal(got, []string{"e4", "e5", "Nf3"}) {
		t.Fatalf("main line = %v", got)
	}
	first := children(moves, root.ID)
	if len(first) != 2 || *first[1].SAN != "d4" || str(first[0].Comment) != "Best by test." || str(first[0].MoveGlyph) != "!" {
		t.Fatalf("children of the root = %+v", first)
	}
	replies := children(moves, first[0].ID)
	if len(replies) != 2 || *replies[0].SAN != "e5" || *replies[1].SAN != "c5" || str(replies[1].Comment) != "The Sicilian." {
		t.Fatalf("replies to e4 = %+v", replies)
	}
	if d := replies[0].Drawings; len(d) != 1 || d[0].From != "e5" || d[0].To != nil || d[0].Brush != "red" {
		t.Fatalf("circle on e5 = %+v", d)
	}
}

func TestCreateNoteRejectsABadTree(t *testing.T) {
	cases := map[string]struct {
		position map[string]any
		moves    []map[string]any
		message  string
	}{
		"parent after the move": {nil, []map[string]any{{"san": "e4", "parent": 1}, {"san": "e5"}}, "Move 0 must follow the Position or an earlier move"},
		"parent of itself":      {nil, []map[string]any{{"san": "e4"}, {"san": "e5", "parent": 1}}, "Move 1 must follow the Position or an earlier move"},
		"same SAN twice":        {nil, []map[string]any{{"san": "e4"}, {"san": "e4"}}, "Move 1 repeats a move already played from the same position"},
		"not a SAN":             {nil, []map[string]any{{"san": "e4 e5"}}, "SAN must be a move in Standard Algebraic Notation, such as Nf3"},
		"move Glyph on root":    {map[string]any{"moveGlyph": "!"}, nil, "The Position cannot have a move Glyph"},
		"unknown Glyph":         {nil, []map[string]any{{"san": "e4", "moveGlyph": "!!!"}}, "The move Glyph must be one of !! ! !? ?! ? ??"},
		"bad Drawing":           {nil, []map[string]any{{"san": "e4", "drawings": []map[string]any{{"from": "e9", "brush": "green"}}}}, "A Drawing must go from a square to a square, such as e2 to e4"},
		"bad brush":             {nil, []map[string]any{{"san": "e4", "drawings": []map[string]any{{"from": "e4", "brush": "pink"}}}}, "A Drawing's brush must be one of green, red, blue, yellow"},
		"link to nobody's note": {nil, []map[string]any{{"san": "e4", "comment": "See [[note:999999]]"}}, "A Link can only point at one of your own notes"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			a := newApp(t)
			s := loggedInAs(t, a, "ada@example.com", "Ada")
			rec := a.createNote(s, toJSON(map[string]any{"name": "Bad", "position": c.position, "moves": c.moves}))
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
			}
			if got := errorOf(t, rec); got != c.message {
				t.Fatalf("error = %q, want %q", got, c.message)
			}
			if n := len(a.listNotes(s)); n != 0 {
				t.Fatalf("%d notes saved, want none", n)
			}
		})
	}
}

func TestAddingAMoveExtendsALineOrStartsAVariation(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	last := a.lineMove(s, n.ID, 6)

	a.clock.Advance(time.Minute)
	extended := a.mustAddMove(s, n.ID, last.ID, "c3")
	if *extended.ParentID != last.ID || *extended.SAN != "c3" {
		t.Fatalf("added = %+v", extended)
	}
	// 2…Nf6 under 2. Nf3 starts a Variation: the Main line keeps 2…Nc6.
	nf3 := a.lineMove(s, n.ID, 3)
	a.mustAddMove(s, n.ID, nf3.ID, "Nf6")

	moves := a.moves(s, n.ID)
	if got := mainLine(moves); !slices.Equal(got, append(slices.Clone(sampleLine), "c3")) {
		t.Fatalf("main line = %v", got)
	}
	if got := children(moves, nf3.ID); len(got) != 2 || *got[1].SAN != "Nf6" {
		t.Fatalf("replies to Nf3 = %+v", got)
	}
	if got := a.getNote(s, n.ID); !got.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("note updatedAt = %v, want %v", got.UpdatedAt, a.clock.Now())
	}
}

func TestReplayingAnExistingSANReusesTheMove(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	e4 := a.lineMove(s, n.ID, 1)
	sicilian := a.mustAddMove(s, n.ID, e4.ID, "c5")

	for _, again := range []moveResponse{a.lineMove(s, n.ID, 2), sicilian} {
		rec := a.addMove(s, n.ID, e4.ID, *again.SAN)
		if rec.Code != http.StatusOK {
			t.Fatalf("replay %s: status = %d, want 200 (body %s)", *again.SAN, rec.Code, rec.Body)
		}
		var got moveResponse
		decodeInto(t, rec, &got)
		if got.ID != again.ID {
			t.Fatalf("replay %s: got move %d, want %d", *again.SAN, got.ID, again.ID)
		}
	}
	if n := len(a.moves(s, n.ID)); n != len(sampleLine)+2 {
		t.Fatalf("%d rows, want the root, the Main line and one Variation", n)
	}
}

func TestWritingOnAVariationMove(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	c5 := a.mustAddMove(s, n.ID, a.lineMove(s, n.ID, 1).ID, "c5")
	nf3 := a.mustAddMove(s, n.ID, c5.ID, "Nf3")

	a.clock.Advance(time.Minute)
	written := a.mustWriteOn(s, n.ID, nf3.ID, map[string]any{
		"comment": "  The Open Sicilian.  ", "body": "Then d4.", "moveGlyph": "!?", "positionGlyph": "⩲",
		"drawings": []map[string]any{{"from": "d2", "to": "d4", "brush": "blue"}, {"from": "d4", "brush": "yellow"}},
	})
	if str(written.Comment) != "The Open Sicilian." || str(written.Body) != "Then d4." || str(written.MoveGlyph) != "!?" ||
		str(written.PositionGlyph) != "⩲" || len(written.Drawings) != 2 || !written.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("written = %+v", written)
	}
	if got := a.getNote(s, n.ID); !got.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("note updatedAt = %v", got.UpdatedAt)
	}

	// Writing replaces all that was there: what is left out is cleared.
	a.mustWriteOn(s, n.ID, nf3.ID, map[string]any{"comment": "Shorter."})
	for _, m := range a.moves(s, n.ID) {
		if m.ID != nf3.ID {
			continue
		}
		if str(m.Comment) != "Shorter." || m.Body != nil || m.MoveGlyph != nil || len(m.Drawings) != 0 {
			t.Fatalf("after rewriting = %+v", m)
		}
	}
}

func TestWritingRejectsBadInput(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	root, e4 := a.lineMove(s, n.ID, 0), a.lineMove(s, n.ID, 1)
	long := strings.Repeat("é", 20_001)
	many := make([]map[string]any, 101)
	for i := range many {
		many[i] = map[string]any{"from": "e4", "brush": "green"}
	}

	cases := map[string]struct {
		move    int64
		fields  map[string]any
		message string
	}{
		"move glyph on the Position": {root.ID, map[string]any{"moveGlyph": "!"}, "The Position cannot have a move Glyph"},
		"unknown move glyph":         {e4.ID, map[string]any{"moveGlyph": "!!!"}, "The move Glyph must be one of !! ! !? ?! ? ??"},
		"position as move":           {e4.ID, map[string]any{"moveGlyph": "±"}, "The move Glyph must be one of !! ! !? ?! ? ??"},
		"unknown position":           {e4.ID, map[string]any{"positionGlyph": "+-"}, "The position Glyph must be one of +− ± ⩲ = ∞ ⩱ ∓ −+"},
		"long comment":               {e4.ID, map[string]any{"comment": long}, "Comment must be at most 20,000 characters"},
		"long body":                  {e4.ID, map[string]any{"body": long}, "Body must be at most 20,000 characters"},
		"too many drawings":          {e4.ID, map[string]any{"drawings": many}, "A move can have at most 100 Drawings"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			rec := a.writeOn(s, n.ID, c.move, c.fields)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
			}
			if got := errorOf(t, rec); got != c.message {
				t.Fatalf("error = %q, want %q", got, c.message)
			}
		})
	}

	// Exactly at the caps is fine, and the Position takes a position Glyph.
	a.mustWriteOn(s, n.ID, e4.ID, map[string]any{"comment": strings.Repeat("é", 20_000), "body": strings.Repeat("é", 20_000), "drawings": many[:100]})
	a.mustWriteOn(s, n.ID, root.ID, map[string]any{"positionGlyph": "="})
}

func TestAddMoveRejectsBadInput(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	other := a.mustCreateNote(s, "Other", sampleTags, nil)
	root := a.lineMove(s, n.ID, 0)

	cases := map[string]struct {
		body string
		code int
	}{
		"no parent":              {`{"san":"e4"}`, http.StatusBadRequest},
		"empty SAN":              {toJSON(map[string]any{"parentId": root.ID, "san": " "}), http.StatusBadRequest},
		"text, not SAN":          {toJSON(map[string]any{"parentId": root.ID, "san": "<b>e4</b>"}), http.StatusBadRequest},
		"SAN too long":           {toJSON(map[string]any{"parentId": root.ID, "san": "exd8=Q+exd8=Q+"}), http.StatusBadRequest},
		"missing parent":         {toJSON(map[string]any{"parentId": 999999, "san": "e4"}), http.StatusNotFound},
		"parent in another note": {toJSON(map[string]any{"parentId": a.lineMove(s, other.ID, 0).ID, "san": "e4"}), http.StatusNotFound},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			rec := a.send(http.MethodPost, movesPath(n.ID), c.body, withBearer(s.AccessToken))
			if rec.Code != c.code {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, c.code, rec.Body)
			}
		})
	}
	if got := len(a.moves(s, n.ID)); got != len(sampleLine)+1 {
		t.Fatalf("%d rows after bad adds", got)
	}
}

type deleteConflictResponse struct {
	Error    string `json:"error"`
	Comments int    `json:"comments"`
	Bodies   int    `json:"bodies"`
	Glyphs   int    `json:"glyphs"`
	Drawings int    `json:"drawings"`
}

func TestDeletingASubtreeWithNoWritingNeedsNoConfirmation(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	// Writing before the deleted Move does not count.
	a.mustWriteOnLine(s, n.ID, 2, map[string]any{"comment": "Kept."})
	nf3 := a.lineMove(s, n.ID, 3)
	a.mustAddMove(s, n.ID, nf3.ID, "Nf6")

	a.clock.Advance(time.Minute)
	if rec := a.deleteMove(s, n.ID, a.lineMove(s, n.ID, 4).ID, false); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d, want 204 (body %s)", rec.Code, rec.Body)
	}
	// 2…Nc6 and the moves after it go, and the Variation 2…Nf6 takes its place.
	moves := a.moves(s, n.ID)
	if got := mainLine(moves); !slices.Equal(got, []string{"e4", "e5", "Nf3", "Nf6"}) {
		t.Fatalf("main line = %v", got)
	}
	if str(a.lineMove(s, n.ID, 2).Comment) != "Kept." {
		t.Fatal("writing before the deleted Move was lost")
	}
	if got := a.getNote(s, n.ID); !got.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("note updatedAt = %v", got.UpdatedAt)
	}
}

func TestDeletingASubtreeWithWritingNeedsConfirmation(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	target := a.mustCreateNote(s, "Target", sampleTags, nil)
	nf3 := a.lineMove(s, n.ID, 3)
	// Writing in the subtree of 2…Nc6, in its Main line and in a nested Variation.
	a.mustWriteOnLine(s, n.ID, 4, map[string]any{"comment": "Natural.", "moveGlyph": "!"})
	a.mustWriteOnLine(s, n.ID, 6, map[string]any{"body": "The Giuoco Piano. " + link(target.ID, ""), "positionGlyph": "="})
	nf6 := a.mustAddMove(s, n.ID, a.lineMove(s, n.ID, 5).ID, "Nf6")
	a.mustWriteOn(s, n.ID, nf6.ID, map[string]any{
		"comment":  "The Two Knights.",
		"drawings": []map[string]any{{"from": "f6", "to": "e4", "brush": "red"}, {"from": "f7", "brush": "green"}},
	})
	// Writing outside it stays.
	sideline := a.mustAddMove(s, n.ID, nf3.ID, "d6")
	a.mustWriteOn(s, n.ID, sideline.ID, map[string]any{"comment": "Philidor.", "drawings": []map[string]any{{"from": "d6", "brush": "blue"}}})
	nc6 := a.lineMove(s, n.ID, 4)
	before := a.getNote(s, n.ID)

	a.clock.Advance(time.Minute)
	rec := a.deleteMove(s, n.ID, nc6.ID, false)
	if rec.Code != http.StatusConflict {
		t.Fatalf("unconfirmed delete: status = %d, want 409 (body %s)", rec.Code, rec.Body)
	}
	var conflict deleteConflictResponse
	decodeInto(t, rec, &conflict)
	want := deleteConflictResponse{
		Error:    "This will delete 2 Comments, 1 Body, 2 Glyphs and 2 Drawings",
		Comments: 2, Bodies: 1, Glyphs: 2, Drawings: 2,
	}
	if conflict != want {
		t.Fatalf("conflict = %+v, want %+v", conflict, want)
	}
	if got := mainLine(a.moves(s, n.ID)); !slices.Equal(got, sampleLine) {
		t.Fatalf("refused delete changed the moves: %v", got)
	}
	if got := a.getNote(s, n.ID); !got.UpdatedAt.Equal(before.UpdatedAt) {
		t.Fatal("refused delete touched the note")
	}

	if rec := a.deleteMove(s, n.ID, nc6.ID, true); rec.Code != http.StatusNoContent {
		t.Fatalf("confirmed delete: status = %d (body %s)", rec.Code, rec.Body)
	}
	moves := a.moves(s, n.ID)
	if got := mainLine(moves); !slices.Equal(got, []string{"e4", "e5", "Nf3", "d6"}) {
		t.Fatalf("main line after delete = %v", got)
	}
	if len(moves) != 5 || str(moves[4].Comment) != "Philidor." {
		t.Fatalf("moves after delete = %+v", moves)
	}
	// The Links in the deleted writing go with it.
	if b := a.links(s, target.ID).Backlinks; len(b) != 0 {
		t.Fatalf("backlinks from deleted writing = %+v", b)
	}
}

func TestDeleteCountsOneOfEachInTheSingular(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	a.mustWriteOnLine(s, n.ID, 6, map[string]any{"positionGlyph": "±"})

	rec := a.deleteMove(s, n.ID, a.lineMove(s, n.ID, 5).ID, false)
	if rec.Code != http.StatusConflict || errorOf(t, rec) != "This will delete 1 Glyph" {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}
}

func TestThePositionCannotBeDeleted(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)

	if rec := a.deleteMove(s, n.ID, a.lineMove(s, n.ID, 0).ID, true); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
	}
	if got := mainLine(a.moves(s, n.ID)); !slices.Equal(got, sampleLine) {
		t.Fatalf("main line = %v", got)
	}
}

func TestPromotingAMoveTwoVariationsDeepPutsItOnTheMainLine(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	e4 := a.lineMove(s, n.ID, 1)
	// 1. e4 e5 (1… c5 2. Nf3 (2. Nc3 Nc6 (2… e6)) 2… d6)
	c5 := a.mustAddMove(s, n.ID, e4.ID, "c5")
	nf3 := a.mustAddMove(s, n.ID, c5.ID, "Nf3")
	a.mustAddMove(s, n.ID, nf3.ID, "d6")
	nc3 := a.mustAddMove(s, n.ID, c5.ID, "Nc3")
	a.mustAddMove(s, n.ID, nc3.ID, "Nc6")
	e6 := a.mustAddMove(s, n.ID, nc3.ID, "e6")
	a.mustWriteOn(s, n.ID, e6.ID, map[string]any{"comment": "Stays on its Move."})
	a.mustWriteOnLine(s, n.ID, 2, map[string]any{"comment": "Stays too."})

	a.clock.Advance(time.Minute)
	if rec := a.promote(s, n.ID, e6.ID); rec.Code != http.StatusNoContent {
		t.Fatalf("promote: status = %d (body %s)", rec.Code, rec.Body)
	}
	moves := a.moves(s, n.ID)
	if got := mainLine(moves); !slices.Equal(got, []string{"e4", "c5", "Nc3", "e6"}) {
		t.Fatalf("main line = %v", got)
	}
	// Each old continuation is now the first Variation.
	sansOf := func(ms []moveResponse) []string {
		out := []string{}
		for _, m := range ms {
			out = append(out, *m.SAN)
		}
		return out
	}
	if got := sansOf(children(moves, e4.ID)); !slices.Equal(got, []string{"c5", "e5"}) {
		t.Fatalf("replies to e4 = %v", got)
	}
	if got := sansOf(children(moves, c5.ID)); !slices.Equal(got, []string{"Nc3", "Nf3"}) {
		t.Fatalf("replies to c5 = %v", got)
	}
	if got := sansOf(children(moves, nc3.ID)); !slices.Equal(got, []string{"e6", "Nc6"}) {
		t.Fatalf("replies to Nc3 = %v", got)
	}
	for _, m := range moves {
		if (m.ID == e6.ID && str(m.Comment) != "Stays on its Move.") || (*ptrOr(m.SAN, "") == "e5" && str(m.Comment) != "Stays too.") {
			t.Fatalf("writing moved: %+v", m)
		}
	}
	if got := a.getNote(s, n.ID); !got.UpdatedAt.Equal(a.clock.Now()) {
		t.Fatalf("note updatedAt = %v", got.UpdatedAt)
	}

	// Promoting a Move already on the Main line changes nothing.
	if rec := a.promote(s, n.ID, e6.ID); rec.Code != http.StatusNoContent {
		t.Fatalf("promote again: status = %d", rec.Code)
	}
	if got := mainLine(a.moves(s, n.ID)); !slices.Equal(got, []string{"e4", "c5", "Nc3", "e6"}) {
		t.Fatalf("main line after promoting again = %v", got)
	}
}

func ptrOr(p *string, or string) *string {
	if p == nil {
		return &or
	}
	return p
}

func TestANoteHoldsAtMost5000Moves(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	// Knights out and back: a legal game is not the server's concern, only the count.
	shuffle := []string{"Nf3", "Nf6", "Ng1", "Ng8"}
	line := make([]string, 5_000)
	for i := range line {
		line[i] = shuffle[i%4]
	}

	over := toJSON(map[string]any{"name": "Too long", "moves": lineMoves(append(slices.Clone(line), "Nf3"))})
	if rec := a.createNote(s, over); rec.Code != http.StatusBadRequest || errorOf(t, rec) != "A note can hold at most 5,000 moves" {
		t.Fatalf("5,001 moves: status = %d (body %s)", rec.Code, rec.Body)
	}

	rec := a.createNote(s, toJSON(map[string]any{"name": "Long", "moves": lineMoves(line)}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("5,000 moves: status = %d (body %s)", rec.Code, rec.Body)
	}
	var n noteResponse
	decodeInto(t, rec, &n)
	root := a.lineMove(s, n.ID, 0)
	rec = a.addMove(s, n.ID, root.ID, "e4")
	if rec.Code != http.StatusBadRequest || errorOf(t, rec) != "A note can hold at most 5,000 moves" {
		t.Fatalf("move 5,001: status = %d (body %s)", rec.Code, rec.Body)
	}
	// Replaying a Move that exists adds nothing, so it is still fine.
	if rec := a.addMove(s, n.ID, root.ID, "Nf3"); rec.Code != http.StatusOK {
		t.Fatalf("replay at the cap: status = %d (body %s)", rec.Code, rec.Body)
	}
	// Deleting makes room.
	last := a.moves(s, n.ID)[5_000]
	if rec := a.deleteMove(s, n.ID, last.ID, false); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d (body %s)", rec.Code, rec.Body)
	}
	a.mustAddMove(s, n.ID, root.ID, "e4")
}

func TestAnotherUsersMovesAreNotFound(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")
	n := a.mustCreateNote(ada, "Private", sampleTags, nil)
	e4 := a.lineMove(ada, n.ID, 1)
	a.mustWriteOn(ada, n.ID, e4.ID, map[string]any{"comment": "Mine.", "moveGlyph": "!"})
	bobs := a.mustCreateNote(bob, "Bob's", sampleTags, nil)

	for name, rec := range map[string]*httptest.ResponseRecorder{
		"list":    a.send(http.MethodGet, movesPath(n.ID), "", withBearer(bob.AccessToken)),
		"add":     a.addMove(bob, n.ID, e4.ID, "c5"),
		"write":   a.writeOn(bob, n.ID, e4.ID, map[string]any{"comment": "Bob's now."}),
		"delete":  a.deleteMove(bob, n.ID, e4.ID, true),
		"promote": a.promote(bob, n.ID, e4.ID),
		// Nor through his own Note.
		"add via own note":    a.addMove(bob, bobs.ID, e4.ID, "c5"),
		"write via own note":  a.writeOn(bob, bobs.ID, e4.ID, map[string]any{"comment": "Bob's now."}),
		"delete via own note": a.deleteMove(bob, bobs.ID, e4.ID, true),
	} {
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s: status = %d, want 404 (body %s)", name, rec.Code, rec.Body)
		}
	}
	for _, path := range []string{"/api/notes/abc/moves", "/api/notes/999999/moves", movePath(n.ID, 0) + "/writing", fmt.Sprintf("/api/notes/%d/moves/x/writing", n.ID)} {
		if rec := a.send(http.MethodPut, path, `{}`, withBearer(ada.AccessToken)); rec.Code != http.StatusNotFound && rec.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s: status = %d, want 404", path, rec.Code)
		}
	}

	got := a.lineMove(ada, n.ID, 1)
	if str(got.Comment) != "Mine." || str(got.MoveGlyph) != "!" || !slices.Equal(mainLine(a.moves(ada, n.ID)), sampleLine) {
		t.Fatalf("Ada's moves changed: %+v", got)
	}
}

func TestDeletingANoteDeletesItsMoves(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	a.mustWriteOnLine(s, n.ID, 1, map[string]any{"comment": "Gone soon."})

	if rec := a.send(http.MethodDelete, notePath(n.ID), "", withBearer(s.AccessToken)); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d", rec.Code)
	}
	var count int
	if err := a.db.QueryRow("SELECT count(*) FROM moves").Scan(&count); err != nil || count != 0 {
		t.Fatalf("moves left = %d (err %v)", count, err)
	}
}

func TestMoveEndpointsRequireAuth(t *testing.T) {
	a := newApp(t)
	for _, req := range []struct{ method, path string }{
		{http.MethodGet, "/api/notes/1/moves"},
		{http.MethodPost, "/api/notes/1/moves"},
		{http.MethodPut, "/api/notes/1/moves/1/writing"},
		{http.MethodDelete, "/api/notes/1/moves/1"},
		{http.MethodPost, "/api/notes/1/moves/1/promote"},
	} {
		if rec := a.send(req.method, req.path, "{}"); rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: status = %d, want 401", req.method, req.path, rec.Code)
		}
	}
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
