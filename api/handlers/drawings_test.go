package handler_test

import (
	"net/http"
	"slices"
	"testing"
)

// Drawings (#77): arrows and circles on a Move or the Position, saved with the
// rest of its writing through PUT …/writing (ADR 0009).

func arrow(from, to, brush string) map[string]any {
	return map[string]any{"from": from, "to": to, "brush": brush}
}

func circle(on, brush string) map[string]any {
	return map[string]any{"from": on, "brush": brush}
}

// drawingsOf reads a Move's Drawings back from the tree, as from, to and brush.
func drawingsOf(t *testing.T, moves []moveResponse, id int64) []string {
	t.Helper()
	for _, m := range moves {
		if m.ID != id {
			continue
		}
		out := []string{}
		for _, d := range m.Drawings {
			to := ""
			if d.To != nil {
				to = *d.To
			}
			out = append(out, d.From+to+" "+d.Brush)
		}
		return out
	}
	t.Fatalf("no move %d", id)
	return nil
}

func TestDrawingsAreSavedOnTheirMoveAndThePosition(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	root, e4 := a.lineMove(s, n.ID, 0), a.lineMove(s, n.ID, 1)
	c5 := a.mustAddMove(s, n.ID, e4.ID, "c5")

	// Drawings alone are writing, on the Position, the Main line and a Variation, in every brush.
	a.mustWriteOn(s, n.ID, root.ID, map[string]any{"drawings": []map[string]any{arrow("e2", "e4", "green"), circle("d5", "yellow")}})
	a.mustWriteOn(s, n.ID, e4.ID, map[string]any{"comment": "Best by test.", "drawings": []map[string]any{circle("e4", "red")}})
	a.mustWriteOn(s, n.ID, c5.ID, map[string]any{"drawings": []map[string]any{arrow("g1", "f3", "blue"), arrow("c5", "d4", "red")}})

	moves := a.moves(s, n.ID)
	for id, want := range map[int64][]string{
		root.ID: {"e2e4 green", "d5 yellow"},
		e4.ID:   {"e4 red"},
		c5.ID:   {"g1f3 blue", "c5d4 red"},
		// Every other Move has none, as an empty list.
		a.lineMove(s, n.ID, 2).ID: {},
	} {
		if got := drawingsOf(t, moves, id); !slices.Equal(got, want) {
			t.Errorf("drawings on move %d = %v, want %v", id, got, want)
		}
	}

	// Drawing one again removes it on the client, which sends what is left with the rest of the writing.
	a.mustWriteOn(s, n.ID, e4.ID, map[string]any{"comment": "Best by test.", "drawings": []map[string]any{}})
	moves = a.moves(s, n.ID)
	if got := drawingsOf(t, moves, e4.ID); len(got) != 0 {
		t.Fatalf("drawings after removing the last = %v", got)
	}
	if got := a.lineMove(s, n.ID, 1); str(got.Comment) != "Best by test." {
		t.Fatalf("the Comment went with the Drawings: %+v", got)
	}
}

func TestDrawingsAloneNeedConfirmationToDelete(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	nf6 := a.mustAddMove(s, n.ID, a.lineMove(s, n.ID, 5).ID, "Nf6")
	a.mustWriteOn(s, n.ID, nf6.ID, map[string]any{"drawings": []map[string]any{arrow("f6", "e4", "red")}})

	rec := a.deleteMove(s, n.ID, nf6.ID, false)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (body %s)", rec.Code, rec.Body)
	}
	var conflict deleteConflictResponse
	decodeInto(t, rec, &conflict)
	if want := (deleteConflictResponse{Error: "This will delete 1 Drawing", Drawings: 1}); conflict != want {
		t.Fatalf("conflict = %+v, want %+v", conflict, want)
	}

	// Drawings anywhere in the subtree count, each one.
	a.mustWriteOnLine(s, n.ID, 6, map[string]any{"drawings": []map[string]any{circle("c5", "green"), circle("f2", "yellow")}})
	rec = a.deleteMove(s, n.ID, a.lineMove(s, n.ID, 4).ID, false)
	if rec.Code != http.StatusConflict || errorOf(t, rec) != "This will delete 3 Drawings" {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}
	if rec := a.deleteMove(s, n.ID, a.lineMove(s, n.ID, 4).ID, true); rec.Code != http.StatusNoContent {
		t.Fatalf("confirmed delete: status = %d (body %s)", rec.Code, rec.Body)
	}
	if got := mainLine(a.moves(s, n.ID)); !slices.Equal(got, []string{"e4", "e5", "Nf3"}) {
		t.Fatalf("main line = %v", got)
	}
}

func TestDrawingsRejectBadShapes(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Italian", sampleTags, nil)
	e4 := a.lineMove(s, n.ID, 1)

	cases := map[string]struct {
		drawings []map[string]any
		message  string
	}{
		"off the board":              {[]map[string]any{arrow("e2", "e9", "green")}, "A Drawing must go from a square to a square, such as e2 to e4"},
		"an arrow to its own square": {[]map[string]any{arrow("e4", "e4", "green")}, "An arrow must point at another square"},
		"the same circle twice":      {[]map[string]any{circle("e4", "green"), circle("e4", "red")}, "A move can have each Drawing only once"},
		"the same arrow twice":       {[]map[string]any{arrow("e2", "e4", "green"), arrow("e2", "e4", "blue")}, "A move can have each Drawing only once"},
		"no brush":                   {[]map[string]any{{"from": "e4"}}, "A Drawing's brush must be one of green, red, blue, yellow"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			rec := a.writeOn(s, n.ID, e4.ID, map[string]any{"drawings": c.drawings})
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
			}
			if got := errorOf(t, rec); got != c.message {
				t.Fatalf("error = %q, want %q", got, c.message)
			}
		})
	}

	// An arrow and a circle can share a square, and arrows can run both ways.
	a.mustWriteOn(s, n.ID, e4.ID, map[string]any{"drawings": []map[string]any{
		circle("e4", "green"), arrow("e4", "d5", "red"), arrow("d5", "e4", "blue"),
	}})
}
