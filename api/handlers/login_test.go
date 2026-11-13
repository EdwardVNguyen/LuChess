package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	handler "github.com/EdwardVNguyen/LuChess/api/handlers"
)

func loginBody(email, password string) string {
	b, _ := json.Marshal(map[string]string{"email": email, "password": password})
	return string(b)
}

type session struct {
	AccessToken string `json:"accessToken"`
	User        struct {
		ID    int32  `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	} `json:"user"`
}

func decodeSession(t *testing.T, rec *httptest.ResponseRecorder) session {
	t.Helper()
	var s session
	if err := json.NewDecoder(rec.Body).Decode(&s); err != nil {
		t.Fatalf("decoding session: %v (body %s)", err, rec.Body)
	}
	return s
}

func TestLoginReturnsAnAccessTokenAndSetsTheRefreshCookie(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)

	rec := a.post("/api/auth/login", loginBody(" Ada@Example.com", goodPassword))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusOK, rec.Body)
	}
	s := decodeSession(t, rec)
	if s.AccessToken == "" || s.User.Email != "ada@example.com" || s.User.Name != "Ada" || s.User.ID == 0 {
		t.Fatalf("session = %+v, want an access token and the user", s)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}

	c := refreshCookie(rec)
	if c == nil || c.Value == "" {
		t.Fatal("no refresh_token cookie was set")
	}
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/api/auth" || c.MaxAge != 30*24*60*60 {
		t.Fatalf("cookie = %+v, want HttpOnly, Secure, SameSite=Lax, Path=/api/auth, 30 days", c)
	}
}

func TestLoginDoesNotRevealWhetherAnEmailHasAnAccount(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)

	wrongPassword := a.post("/api/auth/login", loginBody("ada@example.com", "not the password"))
	unknownEmail := a.post("/api/auth/login", loginBody("nobody@example.com", goodPassword))
	emptyFields := a.post("/api/auth/login", loginBody("", ""))

	for name, rec := range map[string]*httptest.ResponseRecorder{"wrong password": wrongPassword, "unknown email": unknownEmail, "empty fields": emptyFields} {
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want %d", name, rec.Code, http.StatusUnauthorized)
		}
		if refreshCookie(rec) != nil {
			t.Errorf("%s: a refresh cookie was set", name)
		}
	}
	if wrongPassword.Body.String() != unknownEmail.Body.String() {
		t.Fatalf("bodies differ, so they reveal which emails exist:\nwrong password: %s\nunknown email: %s", wrongPassword.Body, unknownEmail.Body)
	}
}

func TestLoginRefusesAnUnverifiedUserOnlyAfterTheRightPassword(t *testing.T) {
	a := newApp(t)
	a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword)) // never verified

	right := a.post("/api/auth/login", loginBody("ada@example.com", goodPassword))
	wrong := a.post("/api/auth/login", loginBody("ada@example.com", "not the password"))

	if right.Code != http.StatusForbidden {
		t.Fatalf("right password: status = %d, want %d (body %s)", right.Code, http.StatusForbidden, right.Body)
	}
	if !strings.Contains(strings.ToLower(right.Body.String()), "verify") {
		t.Fatalf("right password: body %s does not tell the user to verify their email", right.Body)
	}
	if refreshCookie(right) != nil {
		t.Fatal("an unverified user was given a refresh cookie")
	}
	// Without the password, an unverified account looks like any other failure
	if wrong.Code != http.StatusUnauthorized || strings.Contains(strings.ToLower(wrong.Body.String()), "verify") {
		t.Fatalf("wrong password: status %d body %s, want the generic 401", wrong.Code, wrong.Body)
	}
}

func TestLoginRejectsAMalformedBody(t *testing.T) {
	a := newApp(t)

	rec := a.post("/api/auth/login", "email=ada@example.com")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestLoginIsRateLimitedPerEmailEvenForUnknownAddresses(t *testing.T) {
	a := newApp(t, func(c *handler.ApiConfig) { c.Limits.LoginPerEmail = 3 })
	a.verifiedUser("ada@example.com", "Ada", goodPassword)

	for i := range 3 {
		if rec := a.post("/api/auth/login", loginBody("ada@example.com", "guess "+strconv.Itoa(i))); rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: status = %d, want %d", i+1, rec.Code, http.StatusUnauthorized)
		}
	}
	// Even the right password is refused once the budget is spent, or guessing could go on
	assertTooManyRequests(t, a.post("/api/auth/login", loginBody("ada@example.com", goodPassword)))
	// A different capitalization is the same account
	assertTooManyRequests(t, a.post("/api/auth/login", loginBody("ADA@Example.com", goodPassword)))

	// An email with no account is limited just the same, so a 429 reveals nothing
	for range 3 {
		a.post("/api/auth/login", loginBody("nobody@example.com", "x"))
	}
	assertTooManyRequests(t, a.post("/api/auth/login", loginBody("nobody@example.com", "x")))

	if rec := a.post("/api/auth/login", loginBody("someone-else@example.com", "x")); rec.Code != http.StatusUnauthorized {
		t.Fatalf("a different email: status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}

	a.clock.Advance(time.Hour)
	if rec := a.post("/api/auth/login", loginBody("ada@example.com", goodPassword)); rec.Code != http.StatusOK {
		t.Fatalf("after the window: status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestLoginIsRateLimitedPerIP(t *testing.T) {
	a := newApp(t, func(c *handler.ApiConfig) { c.Limits.LoginPerIP = 2 })
	loginFrom := func(ip, email string) *httptest.ResponseRecorder {
		return a.postFrom(ip, "/api/auth/login", loginBody(email, "x"))
	}

	loginFrom("203.0.113.7", "a@example.com")
	loginFrom("203.0.113.7", "b@example.com")
	assertTooManyRequests(t, loginFrom("203.0.113.7", "c@example.com"))

	if rec := loginFrom("198.51.100.9", "c@example.com"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("a different IP: status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

type publicUserResponse struct {
	ID    int32  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func decodeInto(t *testing.T, rec *httptest.ResponseRecorder, dst any) {
	t.Helper()
	if err := json.NewDecoder(rec.Body).Decode(dst); err != nil {
		t.Fatalf("decoding response: %v (body %s)", err, rec.Body)
	}
}
