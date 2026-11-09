package handler_test

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	handler "github.com/EdwardVNguyen/ChessNotes/api/handlers"
	"github.com/lib/pq"
)

func deleteAccountBody(password string) string {
	b, _ := json.Marshal(map[string]string{"password": password})
	return string(b)
}

func (a *app) deleteAccount(s session, password string) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodDelete, "/api/me", deleteAccountBody(password), withBearer(s.AccessToken))
}

// ownedRows says, for every table in the schema, which of its rows belong to
// one user: a condition on `owner`, which holds their user_id and the
// note_ids of their Notes. The Notes are given because Plies and Links reach
// their user only through a Note, which is gone after the deletion.
var ownedRows = map[string]string{
	"users":          `users.id = owner.user_id`,
	"email_tokens":   `email_tokens.user_id = owner.user_id`,
	"refresh_tokens": `refresh_tokens.user_id = owner.user_id`,
	"folders":        `folders.user_id = owner.user_id`,
	"notes":          `notes.user_id = owner.user_id OR notes.id = ANY(owner.note_ids)`,
	"plies":          `plies.note_id = ANY(owner.note_ids)`,
	"links":          `links.note_id = ANY(owner.note_ids)`,
}

// Tables that hold nothing of any user's.
var unownedTables = []string{"goose_db_version"}

// rowsOwnedBy counts, table by table, the rows belonging to a user. It fails
// the test if the schema has a table that ownedRows does not cover, so a new
// table cannot quietly keep a deleted user's data.
func (a *app) rowsOwnedBy(userID int32, noteIDs []int64) map[string]int {
	a.t.Helper()
	tables, err := a.db.QueryContext(a.t.Context(),
		`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)
	if err != nil {
		a.t.Fatalf("listing tables: %v", err)
	}
	defer tables.Close()
	counts := map[string]int{}
	for tables.Next() {
		var name string
		if err := tables.Scan(&name); err != nil {
			a.t.Fatalf("listing tables: %v", err)
		}
		if slices.Contains(unownedTables, name) {
			continue
		}
		condition, ok := ownedRows[name]
		if !ok {
			a.t.Fatalf("table %q is not covered: add how to find a user's rows in it to ownedRows", name)
		}
		query := fmt.Sprintf(`SELECT count(*) FROM %s, (SELECT $1::int AS user_id, $2::bigint[] AS note_ids) AS owner WHERE %s`,
			pq.QuoteIdentifier(name), condition)
		var n int
		if err := a.db.QueryRowContext(a.t.Context(), query, userID, pq.Array(noteIDs)).Scan(&n); err != nil {
			a.t.Fatalf("counting %s: %v", name, err)
		}
		counts[name] = n
	}
	if err := tables.Err(); err != nil {
		a.t.Fatalf("listing tables: %v", err)
	}
	return counts
}

// writer is a user with something in every table: two Sessions, an unused
// email token, a Folder holding a Note, and a Glyph, Comment and Body that
// link to another of their Notes. (A Link can only point at its writer's own
// Notes, so no user's writing links to another's.)
type writer struct {
	session  session
	refresh  string
	other    session
	otherRef string
	noteIDs  []int64
}

func (a *app) writerWithEverything(email, name string) writer {
	a.t.Helper()
	a.verifiedUser(email, name, goodPassword)
	s, refresh := loginSession(a.t, a, email, goodPassword)
	other, otherRef := loginSession(a.t, a, email, goodPassword)
	a.requestReset(email) // left unused

	folder := a.mustCreateFolder(s, name+"'s folder", nil)
	first := a.mustCreateNote(s, name+"'s game", playersPGN, nil)
	second := a.mustCreateNote(s, name+"'s position", playersPGN, nil)
	a.mustFileNote(s, first.ID, &folder.ID)

	a.mustPutPly(s, first.ID, 1, map[string]any{"comment": "See " + link(second.ID, ""), "body": "Then " + link(second.ID, "this"), "moveGlyph": "!"})
	a.mustPutPly(s, first.ID, 0, map[string]any{"body": "The idea.", "positionGlyph": "="})

	return writer{session: s, refresh: refresh, other: other, otherRef: otherRef, noteIDs: []int64{first.ID, second.ID}}
}

func assertEveryTableHasRows(t *testing.T, who string, counts map[string]int) {
	t.Helper()
	for table, n := range counts {
		if n == 0 {
			t.Fatalf("%s has no rows in %s; the test data must cover every table", who, table)
		}
	}
}

func TestDeletingAnAccountRemovesEveryRowOfTheUserAndNoOtherUsers(t *testing.T) {
	a := newApp(t)
	bob := a.writerWithEverything("bob@example.com", "Bob")
	ada := a.writerWithEverything("ada@example.com", "Ada")

	adaBefore := a.rowsOwnedBy(ada.session.User.ID, ada.noteIDs)
	bobBefore := a.rowsOwnedBy(bob.session.User.ID, bob.noteIDs)
	assertEveryTableHasRows(t, "Ada", adaBefore)
	assertEveryTableHasRows(t, "Bob", bobBefore)

	rec := a.deleteAccount(ada.session, goodPassword)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusNoContent, rec.Body)
	}
	for table, n := range a.rowsOwnedBy(ada.session.User.ID, ada.noteIDs) {
		if n != 0 {
			t.Errorf("%s: %d of Ada's rows remain, want none", table, n)
		}
	}
	if bobAfter := a.rowsOwnedBy(bob.session.User.ID, bob.noteIDs); !maps.Equal(bobAfter, bobBefore) {
		t.Errorf("Bob's rows = %v, want them unchanged (%v)", bobAfter, bobBefore)
	}

	// Bob still reads his Notes, writing and Links as before
	if notes := a.listNotes(bob.session); len(notes) != 2 {
		t.Fatalf("Bob's notes = %d, want 2", len(notes))
	}
	if got := str(a.listPlies(bob.session, bob.noteIDs[0])[1].Comment); got != "See "+link(bob.noteIDs[1], "") {
		t.Fatalf("Bob's Comment = %q, want it unchanged", got)
	}
	if bl := a.links(bob.session, bob.noteIDs[1]).Backlinks; len(bl) != 2 {
		t.Fatalf("Backlinks to Bob's Note = %v, want his Comment and Body", bl)
	}
}

func TestDeletingAnAccountEndsEverySession(t *testing.T) {
	a := newApp(t)
	ada := a.writerWithEverything("ada@example.com", "Ada")

	rec := a.deleteAccount(ada.session, goodPassword)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusNoContent, rec.Body)
	}
	if c := refreshCookie(rec); c == nil || c.MaxAge >= 0 || c.Value != "" {
		t.Fatalf("cookie = %+v, want it cleared", c)
	}
	for _, s := range []session{ada.session, ada.other} {
		if code := a.meStatus(s.AccessToken); code != http.StatusUnauthorized {
			t.Fatalf("an access token after deletion: /api/me status = %d, want %d", code, http.StatusUnauthorized)
		}
	}
	for _, refresh := range []string{ada.refresh, ada.otherRef} {
		if code := a.refresh(refresh).Code; code != http.StatusUnauthorized {
			t.Fatalf("a refresh token after deletion: status = %d, want %d", code, http.StatusUnauthorized)
		}
	}
	if code := a.post("/api/auth/login", loginBody("ada@example.com", goodPassword)).Code; code != http.StatusUnauthorized {
		t.Fatalf("logging in after deletion: status = %d, want %d", code, http.StatusUnauthorized)
	}
	// The email and display name are free again
	if code := a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword)).Code; code != http.StatusCreated {
		t.Fatalf("signing up again: status = %d, want %d", code, http.StatusCreated)
	}
}

func TestAWrongPasswordDeletesNothing(t *testing.T) {
	for _, tc := range []struct {
		name     string
		password string
		want     int
	}{
		{"wrong", "not my password at all", http.StatusForbidden},
		{"empty", "", http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a := newApp(t)
			ada := a.writerWithEverything("ada@example.com", "Ada")
			before := a.rowsOwnedBy(ada.session.User.ID, ada.noteIDs)

			rec := a.deleteAccount(ada.session, tc.password)

			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tc.want, rec.Body)
			}
			if after := a.rowsOwnedBy(ada.session.User.ID, ada.noteIDs); !maps.Equal(after, before) {
				t.Fatalf("rows = %v, want them unchanged (%v)", after, before)
			}
			if c := refreshCookie(rec); c != nil {
				t.Fatalf("cookie = %+v, want it left alone", c)
			}
			if code := a.meStatus(ada.session.AccessToken); code != http.StatusOK {
				t.Fatalf("the session after a refused deletion: /api/me status = %d, want %d", code, http.StatusOK)
			}
			if code := a.refresh(ada.refresh).Code; code != http.StatusOK {
				t.Fatalf("the refresh token after a refused deletion: status = %d, want %d", code, http.StatusOK)
			}
		})
	}
}

func TestDeletingAnAccountNeedsASession(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)

	rec := a.send(http.MethodDelete, "/api/me", deleteAccountBody(goodPassword))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
	if _, err := a.queries.GetUserByEmail(t.Context(), "ada@example.com"); err != nil {
		t.Fatalf("Ada after an unauthenticated deletion: %v, want her account intact", err)
	}
}

func TestPasswordAttemptsToDeleteAnAccountAreLimited(t *testing.T) {
	a := newApp(t, func(cfg *handler.ApiConfig) { cfg.Limits.DeletePerUser = 2 })
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	s, _ := loginSession(t, a, "ada@example.com", goodPassword)

	for i := range 2 {
		if code := a.deleteAccount(s, "a wrong guess").Code; code != http.StatusForbidden {
			t.Fatalf("guess %d: status = %d, want %d", i+1, code, http.StatusForbidden)
		}
	}
	rec := a.deleteAccount(s, goodPassword)

	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("status = %d, Retry-After = %q; want 429 with Retry-After", rec.Code, rec.Header().Get("Retry-After"))
	}
	if code := a.meStatus(s.AccessToken); code != http.StatusOK {
		t.Fatalf("the account after a limited attempt: /api/me status = %d, want %d", code, http.StatusOK)
	}
}
