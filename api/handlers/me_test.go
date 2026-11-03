package handler_test

import (
	"net/http"
	"testing"
)

func loggedInAs(t *testing.T, a *app, email, name string) session {
	t.Helper()
	a.verifiedUser(email, name, goodPassword)
	rec := a.post("/api/auth/login", loginBody(email, goodPassword))
	if rec.Code != http.StatusOK {
		t.Fatalf("login: status = %d (body %s)", rec.Code, rec.Body)
	}
	return decodeSession(t, rec)
}

func TestMeReturnsTheLoggedInUser(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")

	rec := a.send(http.MethodGet, "/api/me", "", withBearer(s.AccessToken))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusOK, rec.Body)
	}
	var got publicUserResponse
	decodeInto(t, rec, &got)
	if got.Email != "ada@example.com" || got.Name != "Ada" || got.ID != s.User.ID {
		t.Fatalf("me = %+v, want Ada", got)
	}
}

func TestProtectedEndpointsAnswer401WithAChallengeWithoutAValidBearerToken(t *testing.T) {
	cases := map[string]func(s session) string{
		"no Authorization header":            func(session) string { return "" },
		"not a Bearer scheme":                func(s session) string { return "Basic " + s.AccessToken },
		"empty token":                        func(session) string { return "Bearer " },
		"a token the session module rejects": func(session) string { return "Bearer not.a.jwt" },
	}
	for name, header := range cases {
		t.Run(name, func(t *testing.T) {
			a := newApp(t)
			s := loggedInAs(t, a, "ada@example.com", "Ada")
			value := header(s)

			rec := a.send(http.MethodGet, "/api/me", "", func(r *http.Request) {
				if value != "" {
					r.Header.Set("Authorization", value)
				}
			})

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusUnauthorized, rec.Body)
			}
			if got := rec.Header().Get("WWW-Authenticate"); got != "Bearer" {
				t.Fatalf("WWW-Authenticate = %q, want Bearer", got)
			}
		})
	}
}
