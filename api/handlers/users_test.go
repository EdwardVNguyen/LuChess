package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	handler "github.com/EdwardVNguyen/ChessNotes/api/handlers"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/testdb"
)

type createdUser struct {
	ID    int32  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func signUp(t *testing.T, router http.Handler, email, name, password string) *httptest.ResponseRecorder {
	t.Helper()
	body := `{"email":"` + email + `","name":"` + name + `","password":"` + password + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/users", strings.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestTwoUsersWithDifferentNamesCanSignUp(t *testing.T) {
	db := testdb.New(t)
	queries := database.New(db)
	router := handler.NewRouter(&handler.ApiConfig{Db: queries, FrontendOrigin: frontendOrigin})

	var first, second createdUser
	for _, u := range []struct {
		dst         *createdUser
		email, name string
	}{
		{&first, "ada@example.com", "ada"},
		{&second, "bob@example.com", "bob"},
	} {
		rec := signUp(t, router, u.email, u.name, "correct horse battery staple")
		if rec.Code != http.StatusCreated {
			t.Fatalf("sign up %s: status = %d, want %d (body %s)", u.name, rec.Code, http.StatusCreated, rec.Body)
		}
		if err := json.NewDecoder(rec.Body).Decode(u.dst); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
	}

	if first.ID == second.ID {
		t.Fatalf("both users got id %d, want distinct ids", first.ID)
	}

	// There is no read endpoint yet, so confirm persistence through the data layer.
	stored, err := queries.GetUserByEmail(t.Context(), "bob@example.com")
	if err != nil {
		t.Fatalf("reading bob back from the database: %v", err)
	}
	if stored.ID != second.ID || stored.Name != "bob" {
		t.Fatalf("stored user = {id %d, name %q}, want {id %d, name %q}", stored.ID, stored.Name, second.ID, "bob")
	}
}
