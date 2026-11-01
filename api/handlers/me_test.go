package handler_test

import (
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

// signedToken forges a token with the given claims, method and key, to probe the middleware.
func signedToken(t *testing.T, method jwt.SigningMethod, key any, claims jwt.RegisteredClaims) string {
	t.Helper()
	tok, err := jwt.NewWithClaims(method, claims).SignedString(key)
	if err != nil {
		t.Fatalf("signing test token: %v", err)
	}
	return tok
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

func TestProtectedEndpointsRejectBadAccessTokens(t *testing.T) {
	secret := []byte(testJWTSecret)
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	claims := func(sub string, exp time.Time) jwt.RegisteredClaims {
		return jwt.RegisteredClaims{Subject: sub, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(exp)}
	}

	cases := []struct {
		name   string
		header func(t *testing.T, a *app, s session) string
	}{
		{"no Authorization header", func(*testing.T, *app, session) string { return "" }},
		{"not a Bearer scheme", func(_ *testing.T, _ *app, s session) string { return "Basic " + s.AccessToken }},
		{"empty token", func(*testing.T, *app, session) string { return "Bearer " }},
		{"garbage token", func(*testing.T, *app, session) string { return "Bearer not.a.jwt" }},
		{"signed with another secret", func(t *testing.T, _ *app, s session) string {
			return "Bearer " + signedToken(t, jwt.SigningMethodHS256, []byte("another-secret-that-is-32-bytes-long!!"), claims(strconv.Itoa(int(s.User.ID)), now.Add(time.Minute)))
		}},
		{"signed with a different HMAC algorithm", func(t *testing.T, _ *app, s session) string {
			return "Bearer " + signedToken(t, jwt.SigningMethodHS512, secret, claims(strconv.Itoa(int(s.User.ID)), now.Add(time.Minute)))
		}},
		{"unsigned (alg none)", func(t *testing.T, _ *app, s session) string {
			return "Bearer " + signedToken(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, claims(strconv.Itoa(int(s.User.ID)), now.Add(time.Minute)))
		}},
		{"no expiry", func(t *testing.T, _ *app, s session) string {
			return "Bearer " + signedToken(t, jwt.SigningMethodHS256, secret, jwt.RegisteredClaims{Subject: strconv.Itoa(int(s.User.ID))})
		}},
		{"subject that is not a user id", func(t *testing.T, _ *app, _ session) string {
			return "Bearer " + signedToken(t, jwt.SigningMethodHS256, secret, claims("ada", now.Add(time.Minute)))
		}},
		{"a user that no longer exists", func(t *testing.T, _ *app, _ session) string {
			return "Bearer " + signedToken(t, jwt.SigningMethodHS256, secret, claims("999999", now.Add(time.Minute)))
		}},
		{"expired", func(t *testing.T, a *app, s session) string {
			a.clock.Advance(15 * time.Minute) // the token's lifetime is up exactly now
			return "Bearer " + s.AccessToken
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := newApp(t)
			s := loggedInAs(t, a, "ada@example.com", "Ada")
			header := tc.header(t, a, s)

			rec := a.send(http.MethodGet, "/api/me", "", func(r *http.Request) {
				if header != "" {
					r.Header.Set("Authorization", header)
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

func TestAnAccessTokenIsStillValidJustBeforeItExpires(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	a.clock.Advance(15*time.Minute - time.Second)

	rec := a.send(http.MethodGet, "/api/me", "", withBearer(s.AccessToken))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}
