package handler_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
)

type searchResult struct {
	ID    int64   `json:"id"`
	Name  string  `json:"name"`
	White *string `json:"white"`
	Black *string `json:"black"`
	Date  *string `json:"date"`
}

func gameTags(white, black, date string) tags {
	return tags{{"Event", "Casual"}, {"White", white}, {"Black", black}, {"Date", date}}
}

func (a *app) search(s session, q string) []searchResult {
	a.t.Helper()
	rec := a.send(http.MethodGet, "/api/notes/search?q="+url.QueryEscape(q), "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("search %q: status = %d (body %s)", q, rec.Code, rec.Body)
	}
	var results []searchResult
	decodeInto(a.t, rec, &results)
	return results
}

func names(results []searchResult) []string {
	out := make([]string, len(results))
	for i, r := range results {
		out[i] = r.Name
	}
	return out
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func TestSearchFindsNotesByMisspelledName(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	a.mustCreateNote(s, "Lovelace v. Hopper 1952", sampleTags, nil)
	a.mustCreateNote(s, "Rook endings", sampleTags, nil)

	got := names(a.search(s, "lovelce"))

	if len(got) != 1 || got[0] != "Lovelace v. Hopper 1952" {
		t.Fatalf("results = %v", got)
	}
}

func TestSearchFindsNotesByPartOfAName(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	a.mustCreateNote(s, "Lovelace v. Hopper 1952", sampleTags, nil)

	if got := names(a.search(s, "Lo")); len(got) != 1 {
		t.Fatalf("results = %v", got)
	}
}

func TestSearchFindsNotesByPlayerAndReturnsTheirHeaders(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	created := a.mustCreateNote(s, "Club night", gameTags("Lovelace, Ada", "Hopper, Grace", "1952.03.01"), nil)
	a.mustCreateNote(s, "Rook endings", sampleTags, nil)

	got := a.search(s, "hoper")

	if len(got) != 1 || got[0].ID != created.ID {
		t.Fatalf("results = %v", names(got))
	}
	if deref(got[0].White) != "Lovelace, Ada" || deref(got[0].Black) != "Hopper, Grace" || deref(got[0].Date) != "1952.03.01" {
		t.Fatalf("headers = %s / %s / %s", deref(got[0].White), deref(got[0].Black), deref(got[0].Date))
	}
}

func TestSearchRanksNameMatchesAbovePlayerMatches(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	// Created first, so it would come first on recency alone
	a.mustCreateNote(s, "Club night", gameTags("Hopper, Grace", "Lovelace, Ada", "1952.??.??"), nil)
	a.clock.Advance(1)
	a.mustCreateNote(s, "Hopper's attack", sampleTags, nil)

	got := names(a.search(s, "Hopper"))

	if len(got) != 2 || got[0] != "Hopper's attack" || got[1] != "Club night" {
		t.Fatalf("results = %v", got)
	}
}

func TestSearchNeverReturnsAnotherUsersNotes(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	grace := loggedInAs(t, a, "grace@example.com", "Grace")
	a.mustCreateNote(grace, "Hopper's attack", gameTags("Hopper, Grace", "Lovelace, Ada", "1952.03.01"), nil)

	if got := a.search(ada, "Hopper"); len(got) != 0 {
		t.Fatalf("results = %v", names(got))
	}
}

func TestSearchTreatsWildcardsAsText(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	a.mustCreateNote(s, "Rook endings", sampleTags, nil)

	for _, q := range []string{"%", "_", `\`} {
		if got := a.search(s, q); len(got) != 0 {
			t.Fatalf("search %q: results = %v", q, names(got))
		}
	}
}

func TestBlankSearchReturnsNothing(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	a.mustCreateNote(s, "Rook endings", sampleTags, nil)

	if got := a.search(s, "   "); len(got) != 0 {
		t.Fatalf("results = %v", names(got))
	}
}

func TestSearchNeedsALogin(t *testing.T) {
	a := newApp(t)
	if rec := a.send(http.MethodGet, "/api/notes/search?q=x", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestPlayersAndDateFollowTheTags(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	created := a.mustCreateNote(s, "Club night", gameTags("Lovelace, Ada", "Hopper, Grace", "1952.03.01"), nil)

	changed, _ := json.Marshal(gameTags(`Babbage, "Charles"`, "?", "1843.??.??"))
	_, err := a.db.ExecContext(t.Context(), "UPDATE notes SET tags = $1 WHERE id = $2", changed, created.ID)
	if err != nil {
		t.Fatal(err)
	}

	if got := a.search(s, "Hopper"); len(got) != 0 {
		t.Fatalf("old player still found: %v", names(got))
	}
	got := a.search(s, "Babbage")
	if len(got) != 1 {
		t.Fatalf("results = %v", names(got))
	}
	if deref(got[0].White) != `Babbage, "Charles"` || got[0].Black != nil || deref(got[0].Date) != "1843.??.??" {
		t.Fatalf("headers = %s / %s / %s", deref(got[0].White), deref(got[0].Black), deref(got[0].Date))
	}
}
