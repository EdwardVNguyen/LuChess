package handler_test

import (
	"net/http"
	"testing"
)

func (a *app) logout(refreshToken string, tweak ...func(*http.Request)) int {
	a.t.Helper()
	opts := append([]func(*http.Request){fromFrontend}, tweak...)
	if refreshToken != "" {
		opts = append(opts, withRefreshCookie(refreshToken))
	}
	return a.send(http.MethodPost, "/api/auth/logout", "", opts...).Code
}

func TestLogoutAnswers204AndClearsTheCookie(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	_, refresh := loginSession(t, a, "ada@example.com", goodPassword)

	rec := a.send(http.MethodPost, "/api/auth/logout", "", fromFrontend, withRefreshCookie(refresh))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if c := refreshCookie(rec); c == nil || c.MaxAge >= 0 || c.Value != "" {
		t.Fatalf("cookie = %+v, want it cleared", c)
	}
	if got := a.refresh(refresh).Code; got != http.StatusUnauthorized {
		t.Fatalf("refreshing after logout: status = %d, want %d", got, http.StatusUnauthorized)
	}
}

func TestLogoutAnswers204EvenWithoutAUsableCookie(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	_, refresh := loginSession(t, a, "ada@example.com", goodPassword)

	for i, token := range []string{refresh, refresh, "", "not-a-real-token"} {
		if got := a.logout(token); got != http.StatusNoContent {
			t.Fatalf("logout #%d: status = %d, want %d", i+1, got, http.StatusNoContent)
		}
	}
}

func TestLogoutOnlyAcceptsRequestsFromTheFrontendOrigin(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	_, refresh := loginSession(t, a, "ada@example.com", goodPassword)

	forged := a.send(http.MethodPost, "/api/auth/logout", "", withRefreshCookie(refresh), func(r *http.Request) {
		r.Header.Set("Origin", "https://evil.example")
	})

	if forged.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", forged.Code, http.StatusForbidden)
	}
	if got := a.refresh(refresh).Code; got != http.StatusOK {
		t.Fatalf("the session after a forged logout: status = %d, want it untouched (%d)", got, http.StatusOK)
	}
}
