package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	handler "github.com/EdwardVNguyen/LuChess/api/handlers"
)

const newPassword = "a brand new passphrase"

func forgotBody(email string) string {
	b, _ := json.Marshal(map[string]string{"email": email})
	return string(b)
}

func resetBody(token, password string) string {
	b, _ := json.Marshal(map[string]string{"token": token, "password": password})
	return string(b)
}

// requestReset asks for a reset email and returns the token from it.
func (a *app) requestReset(email string) string {
	a.t.Helper()
	before := len(a.mail.Sent())
	if rec := a.post("/api/auth/forgot-password", forgotBody(email)); rec.Code != http.StatusOK {
		a.t.Fatalf("forgot password %s: status = %d (body %s)", email, rec.Code, rec.Body)
	}
	sent := a.mail.Sent()
	if len(sent) != before+1 {
		a.t.Fatalf("emails sent = %d, want 1", len(sent)-before)
	}
	return tokenFromEmail(a.t, sent[before].Text)
}

func TestForgotPasswordEmailsAResetLinkToTheFrontend(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	before := len(a.mail.Sent())

	rec := a.post("/api/auth/forgot-password", forgotBody("  ADA@example.com "))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusOK, rec.Body)
	}
	sent := a.mail.Sent()[before:]
	if len(sent) != 1 {
		t.Fatalf("emails sent = %d, want 1", len(sent))
	}
	if sent[0].To != "ada@example.com" {
		t.Fatalf("sent to %q, want ada@example.com", sent[0].To)
	}
	if !strings.Contains(sent[0].Text, frontendOrigin+"/reset-password?token=") {
		t.Fatalf("email has no frontend reset link:\n%s", sent[0].Text)
	}
}

func TestForgotPasswordDoesNotRevealWhichEmailsHaveAccounts(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)

	known := a.post("/api/auth/forgot-password", forgotBody("ada@example.com"))
	unknown := a.post("/api/auth/forgot-password", forgotBody("nobody@example.com"))

	if known.Code != http.StatusOK || unknown.Code != known.Code {
		t.Fatalf("status known = %d, unknown = %d, want both %d", known.Code, unknown.Code, http.StatusOK)
	}
	if known.Body.String() != unknown.Body.String() {
		t.Fatalf("response bodies differ:\nknown: %s\nunknown: %s", known.Body, unknown.Body)
	}
	for _, m := range a.mail.Sent() {
		if m.To == "nobody@example.com" {
			t.Fatal("an email was sent to an address with no account")
		}
	}
}

func TestResetPasswordChangesThePassword(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	token := a.requestReset("ada@example.com")

	rec := a.post("/api/auth/reset-password", resetBody(token, newPassword))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusNoContent, rec.Body)
	}
	if got := a.post("/api/auth/login", loginBody("ada@example.com", goodPassword)).Code; got != http.StatusUnauthorized {
		t.Fatalf("login with the old password: status = %d, want %d", got, http.StatusUnauthorized)
	}
	loginSession(t, a, "ada@example.com", newPassword)
}

func TestResetPasswordEndsEverySessionOfThatUser(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	a.verifiedUser("bob@example.com", "Bob", goodPassword)
	_, laptop := loginSession(t, a, "ada@example.com", goodPassword)
	_, phone := loginSession(t, a, "ada@example.com", goodPassword)
	_, bobs := loginSession(t, a, "bob@example.com", goodPassword)
	token := a.requestReset("ada@example.com")

	if rec := a.post("/api/auth/reset-password", resetBody(token, newPassword)); rec.Code != http.StatusNoContent {
		t.Fatalf("reset: status = %d (body %s)", rec.Code, rec.Body)
	}

	for name, refresh := range map[string]string{"laptop": laptop, "phone": phone} {
		if got := a.refresh(refresh).Code; got != http.StatusUnauthorized {
			t.Errorf("%s session: refresh status = %d, want %d", name, got, http.StatusUnauthorized)
		}
	}
	if got := a.refresh(bobs).Code; got != http.StatusOK {
		t.Errorf("another user's session: refresh status = %d, want it untouched (%d)", got, http.StatusOK)
	}
}

func TestResetPasswordTokenWorksOnce(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	token := a.requestReset("ada@example.com")
	if rec := a.post("/api/auth/reset-password", resetBody(token, newPassword)); rec.Code != http.StatusNoContent {
		t.Fatalf("first use: status = %d (body %s)", rec.Code, rec.Body)
	}

	rec := a.post("/api/auth/reset-password", resetBody(token, "yet another passphrase"))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("second use: status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
	loginSession(t, a, "ada@example.com", newPassword)
}

func TestResetPasswordTokenWorksOnceEvenWhenUsedTwiceAtTheSameTime(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	token := a.requestReset("ada@example.com")

	codes := make([]int, 2)
	var wg sync.WaitGroup
	for i := range codes {
		wg.Go(func() {
			codes[i] = a.post("/api/auth/reset-password", resetBody(token, newPassword)).Code
		})
	}
	wg.Wait()

	ok := 0
	for _, c := range codes {
		if c == http.StatusNoContent {
			ok++
		}
	}
	if ok != 1 {
		t.Fatalf("statuses = %v, want exactly one success", codes)
	}
}

func TestResetPasswordTokenExpiresAfterOneHour(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	token := a.requestReset("ada@example.com")
	a.clock.Advance(time.Hour) // the token's lifetime is up exactly now

	rec := a.post("/api/auth/reset-password", resetBody(token, newPassword))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
	loginSession(t, a, "ada@example.com", goodPassword)
}

func TestResetPasswordTokenStillWorksJustBeforeTheHourIsUp(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	token := a.requestReset("ada@example.com")
	a.clock.Advance(time.Hour - time.Second)

	if rec := a.post("/api/auth/reset-password", resetBody(token, newPassword)); rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusNoContent, rec.Body)
	}
}

func TestResetPasswordRejectsBadTokens(t *testing.T) {
	cases := map[string]func(a *app) string{
		"an unknown token": func(*app) string { return "not-a-real-token" },
		"an empty token":   func(*app) string { return "" },
		"a verification token": func(a *app) string {
			a.post("/api/auth/signup", signupBody("bob@example.com", "Bob", goodPassword))
			sent := a.mail.Sent()
			return tokenFromEmail(a.t, sent[len(sent)-1].Text)
		},
		"a link replaced by a newer one": func(a *app) string {
			old := a.requestReset("ada@example.com")
			a.requestReset("ada@example.com")
			return old
		},
	}
	for name, token := range cases {
		t.Run(name, func(t *testing.T) {
			a := newApp(t)
			a.verifiedUser("ada@example.com", "Ada", goodPassword)

			rec := a.post("/api/auth/reset-password", resetBody(token(a), newPassword))

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusBadRequest, rec.Body)
			}
			loginSession(t, a, "ada@example.com", goodPassword)
		})
	}
}

func TestResetPasswordRejectsAnInvalidPasswordWithoutSpendingTheToken(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	token := a.requestReset("ada@example.com")

	rec := a.post("/api/auth/reset-password", resetBody(token, "short"))

	if rec.Code != http.StatusBadRequest || !strings.Contains(strings.ToLower(rec.Body.String()), "password") {
		t.Fatalf("status = %d, body %s; want 400 about the password", rec.Code, rec.Body)
	}
	if rec := a.post("/api/auth/reset-password", resetBody(token, newPassword)); rec.Code != http.StatusNoContent {
		t.Fatalf("retry with a valid password: status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestResetPasswordVerifiesAnUnverifiedEmail(t *testing.T) {
	a := newApp(t)
	a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))
	token := a.requestReset("ada@example.com")

	if rec := a.post("/api/auth/reset-password", resetBody(token, newPassword)); rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}

	loginSession(t, a, "ada@example.com", newPassword)
}

func TestForgotPasswordIsRateLimitedPerEmailEvenForUnknownAddresses(t *testing.T) {
	a := newApp(t, func(c *handler.ApiConfig) { c.Limits.ForgotPerEmail = 2 })
	forgot := func(email string) *httptest.ResponseRecorder {
		return a.post("/api/auth/forgot-password", forgotBody(email))
	}

	for range 2 {
		if rec := forgot("nobody@example.com"); rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
		}
	}
	assertTooManyRequests(t, forgot("nobody@example.com"))
	assertTooManyRequests(t, forgot("NOBODY@example.com"))

	if rec := forgot("someone-else@example.com"); rec.Code != http.StatusOK {
		t.Fatalf("a different email: status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestForgotPasswordIsRateLimitedPerIP(t *testing.T) {
	a := newApp(t, func(c *handler.ApiConfig) { c.Limits.ForgotPerIP = 2 })
	forgotFrom := func(ip, email string) *httptest.ResponseRecorder {
		return a.postFrom(ip, "/api/auth/forgot-password", forgotBody(email))
	}

	forgotFrom("203.0.113.7", "a@example.com")
	forgotFrom("203.0.113.7", "b@example.com")
	assertTooManyRequests(t, forgotFrom("203.0.113.7", "c@example.com"))

	if rec := forgotFrom("198.51.100.9", "c@example.com"); rec.Code != http.StatusOK {
		t.Fatalf("a different IP: status = %d, want %d", rec.Code, http.StatusOK)
	}
}
