package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	handler "github.com/EdwardVNguyen/ChessNotes/api/handlers"
)

// loginSession logs a verified user in and returns the session and its refresh token.
func loginSession(t *testing.T, a *app, email, password string) (session, string) {
	t.Helper()
	rec := a.post("/api/auth/login", loginBody(email, password))
	if rec.Code != http.StatusOK {
		t.Fatalf("login %s: status = %d (body %s)", email, rec.Code, rec.Body)
	}
	c := refreshCookie(rec)
	if c == nil {
		t.Fatalf("login %s set no refresh cookie", email)
	}
	return decodeSession(t, rec), c.Value
}

func (a *app) refresh(refreshToken string, tweak ...func(*http.Request)) *httptest.ResponseRecorder {
	a.t.Helper()
	opts := append([]func(*http.Request){fromFrontend}, tweak...)
	if refreshToken != "" {
		opts = append(opts, withRefreshCookie(refreshToken))
	}
	return a.send(http.MethodPost, "/api/auth/refresh", "", opts...)
}

func (a *app) meStatus(accessToken string) int {
	a.t.Helper()
	return a.send(http.MethodGet, "/api/me", "", withBearer(accessToken)).Code
}

func TestRefreshExchangesTheTokenForANewSession(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	first, firstRefresh := loginSession(t, a, "ada@example.com", goodPassword)
	a.clock.Advance(10 * time.Minute)

	rec := a.refresh(firstRefresh)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusOK, rec.Body)
	}
	next := decodeSession(t, rec)
	if next.User.Email != "ada@example.com" || next.AccessToken == "" || next.AccessToken == first.AccessToken {
		t.Fatalf("session = %+v, want a new access token for Ada", next)
	}
	if code := a.meStatus(next.AccessToken); code != http.StatusOK {
		t.Fatalf("the new access token: /api/me status = %d, want %d", code, http.StatusOK)
	}
	c := refreshCookie(rec)
	if c == nil || c.Value == "" || c.Value == firstRefresh {
		t.Fatalf("cookie = %+v, want a new refresh token", c)
	}
	if !c.HttpOnly || !c.Secure || c.Path != "/api/auth" || c.MaxAge != 30*24*60*60 {
		t.Fatalf("cookie = %+v, want the same protections as at login, with a fresh 30 days", c)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	// The new refresh token keeps the session going
	if rec := a.refresh(c.Value); rec.Code != http.StatusOK {
		t.Fatalf("refreshing again with the new token: status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestRefreshRejectsMissingOrUnknownTokens(t *testing.T) {
	for name, token := range map[string]string{"no cookie": "", "unknown token": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"} {
		t.Run(name, func(t *testing.T) {
			a := newApp(t)

			rec := a.refresh(token)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusUnauthorized, rec.Body)
			}
			if c := refreshCookie(rec); c == nil || c.MaxAge >= 0 {
				t.Fatalf("cookie = %+v, want the cookie cleared", c)
			}
		})
	}
}

func TestRefreshRejectsAnExpiredTokenWithoutTreatingItAsTheft(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	_, oldRefresh := loginSession(t, a, "ada@example.com", goodPassword)
	a.clock.Advance(29 * 24 * time.Hour)
	_, laterRefresh := loginSession(t, a, "ada@example.com", goodPassword) // a second device, logged in later
	a.clock.Advance(24 * time.Hour)                                        // the first token's 30 days are now up

	expired := a.refresh(oldRefresh)

	if expired.Code != http.StatusUnauthorized {
		t.Fatalf("expired token: status = %d, want %d", expired.Code, http.StatusUnauthorized)
	}
	if rec := a.refresh(laterRefresh); rec.Code != http.StatusOK {
		t.Fatalf("the other device's session: status = %d, want it untouched (%d)", rec.Code, http.StatusOK)
	}
}

func TestReusingAnAlreadyUsedRefreshTokenRevokesEverySessionOfThatUser(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	a.verifiedUser("bob@example.com", "Bob", goodPassword)
	_, adaPhone := loginSession(t, a, "ada@example.com", goodPassword)
	_, adaLaptop := loginSession(t, a, "ada@example.com", goodPassword)
	_, bob := loginSession(t, a, "bob@example.com", goodPassword)

	// The phone refreshes normally, then someone replays the token it just used
	rotated := a.refresh(adaPhone)
	phoneNow := refreshCookie(rotated).Value
	replay := a.refresh(adaPhone)

	if replay.Code != http.StatusUnauthorized {
		t.Fatalf("replayed token: status = %d, want %d", replay.Code, http.StatusUnauthorized)
	}
	for name, token := range map[string]string{"the phone's current token": phoneNow, "the laptop": adaLaptop} {
		if rec := a.refresh(token); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want %d after the theft response", name, rec.Code, http.StatusUnauthorized)
		}
	}
	if rec := a.refresh(bob); rec.Code != http.StatusOK {
		t.Fatalf("another user's session: status = %d, want it untouched (%d)", rec.Code, http.StatusOK)
	}
}

func TestRefreshOnlyAcceptsRequestsFromTheFrontendOrigin(t *testing.T) {
	cases := map[string]func(*http.Request){
		"no Origin header": func(r *http.Request) { r.Header.Del("Origin") },
		"another origin":   func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") },
		"a lookalike":      func(r *http.Request) { r.Header.Set("Origin", frontendOrigin+".evil.example") },
	}
	for name, tweak := range cases {
		t.Run(name, func(t *testing.T) {
			a := newApp(t)
			a.verifiedUser("ada@example.com", "Ada", goodPassword)
			_, refresh := loginSession(t, a, "ada@example.com", goodPassword)

			rec := a.refresh(refresh, tweak)

			if rec.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
			}
			// A forged request must not use up the user's real token
			if rec := a.refresh(refresh); rec.Code != http.StatusOK {
				t.Fatalf("the real token afterwards: status = %d, want %d", rec.Code, http.StatusOK)
			}
		})
	}
}

func TestRefreshIsRateLimitedPerIP(t *testing.T) {
	a := newApp(t, func(c *handler.ApiConfig) { c.Limits.RefreshPerIP = 2 })
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	_, refresh := loginSession(t, a, "ada@example.com", goodPassword)

	first := a.refresh(refresh, a.fromIP("203.0.113.7"))
	second := a.refresh(refreshCookie(first).Value, a.fromIP("203.0.113.7"))
	third := a.refresh(refreshCookie(second).Value, a.fromIP("203.0.113.7"))

	if first.Code != http.StatusOK || second.Code != http.StatusOK {
		t.Fatalf("first two refreshes: %d and %d, want both %d", first.Code, second.Code, http.StatusOK)
	}
	assertTooManyRequests(t, third)
	// A request refused for rate limiting must not have used up the token
	if rec := a.refresh(refreshCookie(second).Value, a.fromIP("198.51.100.9")); rec.Code != http.StatusOK {
		t.Fatalf("the same token from another IP: status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestTwoRefreshesAtTheSameTimeLeaveExactlyOneWinner(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	_, refresh := loginSession(t, a, "ada@example.com", goodPassword)

	const attempts = 6
	codes := make(chan int, attempts)
	for range attempts {
		go func() { codes <- a.refresh(refresh).Code }()
	}
	won := 0
	for range attempts {
		if <-codes == http.StatusOK {
			won++
		}
	}

	if won != 1 {
		t.Fatalf("%d of %d simultaneous refreshes succeeded, want exactly 1", won, attempts)
	}
}
