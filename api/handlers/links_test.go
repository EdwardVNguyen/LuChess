package handler_test

import (
	"fmt"
	"net/http"
	"slices"
	"testing"
)

type linkTargetResponse struct {
	ID    int64   `json:"id"`
	Name  string  `json:"name"`
	White *string `json:"white"`
	Black *string `json:"black"`
	Date  *string `json:"date"`
}

type backlinkResponse struct {
	NoteID   int64   `json:"noteId"`
	Name     string  `json:"name"`
	StartFEN *string `json:"startFen"`
	Ply      int     `json:"ply"`
	Part     string  `json:"part"`
}

type linksResponse struct {
	Targets   []linkTargetResponse `json:"targets"`
	Backlinks []backlinkResponse   `json:"backlinks"`
}

func (a *app) links(s session, noteID int64) linksResponse {
	a.t.Helper()
	rec := a.send(http.MethodGet, fmt.Sprintf("/api/notes/%d/links", noteID), "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("links: status = %d (body %s)", rec.Code, rec.Body)
	}
	var l linksResponse
	decodeInto(a.t, rec, &l)
	return l
}

func targetIDs(l linksResponse) []int64 {
	ids := []int64{}
	for _, t := range l.Targets {
		ids = append(ids, t.ID)
	}
	return ids
}

func link(id int64, label string) string {
	if label == "" {
		return fmt.Sprintf("[[note:%d]]", id)
	}
	return fmt.Sprintf("[[note:%d|%s]]", id, label)
}

const playersPGN = "[White \"Lovelace, Ada\"]\n[Black \"Hopper, Grace\"]\n[Date \"1952.03.01\"]\n\n1. e4 e5 *"

func TestLinkNotesWithAndWithoutALabel(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	from := a.mustCreateNote(s, "Italian", samplePGN, nil)
	hanging := a.mustCreateNote(s, "Hanging pawns", playersPGN, nil)
	tartakower := a.mustCreateNote(s, "Tartakower Variation", samplePGN, nil)

	a.mustPutPly(s, from.ID, 3, map[string]any{
		"comment": "See " + link(hanging.ID, "the pawns") + ".",
		"body":    "The " + link(tartakower.ID, "") + " and " + link(hanging.ID, "") + " again.",
	})

	// The text is stored as written; the index serves the names.
	if got := a.listPlies(s, from.ID)[0]; str(got.Comment) != "See [[note:"+fmt.Sprint(hanging.ID)+"|the pawns]]." {
		t.Fatalf("comment = %q", str(got.Comment))
	}
	l := a.links(s, from.ID)
	if !slices.Equal(targetIDs(l), []int64{hanging.ID, tartakower.ID}) {
		t.Fatalf("targets = %+v", l.Targets)
	}
	if l.Targets[0].Name != "Hanging pawns" || str(l.Targets[0].White) != "Lovelace, Ada" || str(l.Targets[0].Date) != "1952.03.01" {
		t.Fatalf("target = %+v", l.Targets[0])
	}
}

func TestRenamingATargetChangesItsNameWithoutEditingText(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	from := a.mustCreateNote(s, "Italian", samplePGN, nil)
	target := a.mustCreateNote(s, "Hanging pawns", samplePGN, nil)
	a.mustPutPly(s, from.ID, 0, map[string]any{"body": link(target.ID, "")})

	a.send(http.MethodPatch, notePath(target.ID), `{"name":"Hanging pawns, frozen"}`, withBearer(s.AccessToken))

	if l := a.links(s, from.ID); len(l.Targets) != 1 || l.Targets[0].Name != "Hanging pawns, frozen" {
		t.Fatalf("targets = %+v", l.Targets)
	}
	if got := a.listPlies(s, from.ID)[0]; str(got.Body) != link(target.ID, "") {
		t.Fatalf("body = %q", str(got.Body))
	}
}

func TestSameNamedNotesAreLinkedSeparately(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	from := a.mustCreateNote(s, "Italian", samplePGN, nil)
	first := a.mustCreateNote(s, "Club night", samplePGN, nil)
	second := a.mustCreateNote(s, "Club night", samplePGN, nil)

	a.mustPutPly(s, from.ID, 1, map[string]any{"comment": link(second.ID, "")})

	if got := targetIDs(a.links(s, from.ID)); !slices.Equal(got, []int64{second.ID}) {
		t.Fatalf("targets = %v, want only %d", got, second.ID)
	}
	if b := a.links(s, first.ID).Backlinks; len(b) != 0 {
		t.Fatalf("first's backlinks = %+v, want none", b)
	}
	if b := a.links(s, second.ID).Backlinks; len(b) != 1 {
		t.Fatalf("second's backlinks = %+v", b)
	}
}

func TestBacklinksNameTheLinkingCommentOrBodyAndItsPly(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	target := a.mustCreateNote(s, "Hanging pawns", samplePGN, nil)
	fen := sampleFEN
	ending := a.mustCreateNote(s, "An ending", "*", &fen)
	club := a.mustCreateNote(s, "Club night", samplePGN, nil)

	a.mustPutPly(s, club.ID, 3, map[string]any{"comment": link(target.ID, ""), "body": "Again: " + link(target.ID, "here")})
	a.mustPutPly(s, ending.ID, 0, map[string]any{"body": link(target.ID, "")})
	// A Note linking to itself is no Backlink.
	a.mustPutPly(s, target.ID, 1, map[string]any{"comment": link(target.ID, "")})

	got := a.links(s, target.ID).Backlinks
	want := []backlinkResponse{
		{NoteID: ending.ID, Name: "An ending", StartFEN: &fen, Ply: 0, Part: "body"},
		{NoteID: club.ID, Name: "Club night", Ply: 3, Part: "comment"},
		{NoteID: club.ID, Name: "Club night", Ply: 3, Part: "body"},
	}
	if len(got) != len(want) {
		t.Fatalf("backlinks = %+v", got)
	}
	for i := range want {
		g, w := got[i], want[i]
		if g.NoteID != w.NoteID || g.Name != w.Name || g.Ply != w.Ply || g.Part != w.Part || str(g.StartFEN) != str(w.StartFEN) {
			t.Fatalf("backlink %d = %+v, want %+v", i, g, w)
		}
	}
}

func TestEditingOrDeletingWritingUpdatesBacklinks(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	target := a.mustCreateNote(s, "Hanging pawns", samplePGN, nil)
	other := a.mustCreateNote(s, "Isolated pawn", samplePGN, nil)
	from := a.mustCreateNote(s, "Italian", samplePGN, nil)

	a.mustPutPly(s, from.ID, 2, map[string]any{"comment": link(target.ID, ""), "body": link(target.ID, "")})
	if b := a.links(s, target.ID).Backlinks; len(b) != 2 {
		t.Fatalf("backlinks = %+v", b)
	}

	// Editing the Comment to link elsewhere moves its Backlink.
	a.mustPutPly(s, from.ID, 2, map[string]any{"comment": link(other.ID, ""), "body": link(target.ID, "")})
	if b := a.links(s, target.ID).Backlinks; len(b) != 1 || b[0].Part != "body" {
		t.Fatalf("target's backlinks = %+v", b)
	}
	if b := a.links(s, other.ID).Backlinks; len(b) != 1 || b[0].Part != "comment" {
		t.Fatalf("other's backlinks = %+v", b)
	}

	// Deleting the Body removes its Backlink.
	a.mustPutPly(s, from.ID, 2, map[string]any{"comment": link(other.ID, "")})
	if b := a.links(s, target.ID).Backlinks; len(b) != 0 {
		t.Fatalf("target's backlinks = %+v", b)
	}

	// Clearing the Ply, then deleting the linking Note, remove the rest.
	a.mustPutPly(s, from.ID, 4, map[string]any{"body": link(target.ID, "")})
	a.mustPutPly(s, from.ID, 2, map[string]any{})
	if b := a.links(s, other.ID).Backlinks; len(b) != 0 {
		t.Fatalf("other's backlinks after clearing = %+v", b)
	}
	if rec := a.send(http.MethodDelete, notePath(from.ID), "", withBearer(s.AccessToken)); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d", rec.Code)
	}
	if b := a.links(s, target.ID).Backlinks; len(b) != 0 {
		t.Fatalf("target's backlinks after deleting the linking note = %+v", b)
	}
}

func TestDeletingATargetLeavesAnUnresolvedLink(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	from := a.mustCreateNote(s, "Italian", samplePGN, nil)
	target := a.mustCreateNote(s, "Hanging pawns", samplePGN, nil)
	text := "See " + link(target.ID, "the pawns")
	a.mustPutPly(s, from.ID, 1, map[string]any{"comment": text})

	a.send(http.MethodDelete, notePath(target.ID), "", withBearer(s.AccessToken))

	if l := a.links(s, from.ID); len(l.Targets) != 0 {
		t.Fatalf("targets = %+v, want none", l.Targets)
	}
	if got := a.listPlies(s, from.ID)[0]; str(got.Comment) != text {
		t.Fatalf("comment = %q, want the Link kept in the text", str(got.Comment))
	}
	// The Unresolved Link does not stop the user editing around it, even
	// moving it into the Body.
	a.mustPutPly(s, from.ID, 1, map[string]any{"comment": text + ", now gone."})
	a.mustPutPly(s, from.ID, 1, map[string]any{"body": text})
	// It cannot be carried to another Ply.
	if rec := a.putPly(s, from.ID, 2, map[string]any{"comment": text}); rec.Code != http.StatusBadRequest {
		t.Fatalf("unresolved link on another ply: status = %d (body %s)", rec.Code, rec.Body)
	}
}

func TestLinkingToAnotherUsersNoteIsRejected(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	grace := loggedInAs(t, a, "grace@example.com", "Grace")
	mine := a.mustCreateNote(ada, "Italian", samplePGN, nil)
	theirs := a.mustCreateNote(grace, "Grace's secret", samplePGN, nil)

	for name, target := range map[string]int64{"another user's": theirs.ID, "a missing": theirs.ID + 1000} {
		rec := a.putPly(ada, mine.ID, 1, map[string]any{"comment": "Peek " + link(target, "")})
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s note: status = %d (body %s)", name, rec.Code, rec.Body)
		}
	}
	if got := a.listPlies(ada, mine.ID); len(got) != 0 {
		t.Fatalf("plies = %+v, want nothing saved", got)
	}
	if b := a.links(grace, theirs.ID).Backlinks; len(b) != 0 {
		t.Fatalf("grace's backlinks = %+v", b)
	}
	// Nor can anyone read the Links of a Note that is not theirs.
	rec := a.send(http.MethodGet, fmt.Sprintf("/api/notes/%d/links", mine.ID), "", withBearer(grace.AccessToken))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("other user's links: status = %d", rec.Code)
	}
}

func TestTextThatOnlyLooksLikeALinkIsText(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	from := a.mustCreateNote(s, "Italian", samplePGN, nil)

	for _, text := range []string{"[[note:0]]", "[[note:abc]]", "[[Hanging pawns]]", "[[note:1|a]b]]", "[[note:1234567890123456]]"} {
		a.mustPutPly(s, from.ID, 1, map[string]any{"comment": text})
	}
}
