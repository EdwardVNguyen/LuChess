package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	handler "github.com/EdwardVNguyen/ChessNotes/api/handlers"
)

const goodPassword = "correct horse battery"

func signupBody(email, name, password string) string {
	b, _ := json.Marshal(map[string]string{"email": email, "name": name, "password": password})
	return string(b)
}

func TestTwoUsersWithDifferentNamesCanSignUp(t *testing.T) {
	a := newApp(t)
	var ids []int32
	for _, u := range []struct{ email, name string }{{"ada@example.com", "Ada"}, {"bob@example.com", "Bob"}} {
		rec := a.post("/api/auth/signup", signupBody(u.email, u.name, goodPassword))
		if rec.Code != http.StatusCreated {
			t.Fatalf("sign up %s: status = %d, want %d (body %s)", u.name, rec.Code, http.StatusCreated, rec.Body)
		}
		var created struct {
			ID int32 `json:"id"`
		}
		if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		ids = append(ids, created.ID)
	}
	if ids[0] == ids[1] {
		t.Fatalf("both users got id %d, want distinct ids", ids[0])
	}
}

func TestTheOldPlaintextSignUpEndpointIsGone(t *testing.T) {
	a := newApp(t)

	rec := a.post("/api/users", `{"email":"ada@example.com","name":"Ada","password":"correct horse battery"}`)

	if rec.Code != http.StatusNotFound && rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want the route to be gone (404 or 405)", rec.Code)
	}
	if _, err := a.queries.GetUserByEmail(t.Context(), "ada@example.com"); err == nil {
		t.Fatal("the removed endpoint still created a user")
	}
}

func TestSignUpRejectsInvalidInput(t *testing.T) {
	cases := []struct {
		name      string
		body      string
		wantField string
	}{
		{"empty email", signupBody("", "Ada", goodPassword), "email"},
		{"email without domain dot", signupBody("ada@localhost", "Ada", goodPassword), "email"},
		{"email with a display name", signupBody("Ada <ada@example.com>", "Ada", goodPassword), "email"},
		{"email too long", signupBody(strings.Repeat("a", 250)+"@example.com", "Ada", goodPassword), "email"},
		{"blank name", signupBody("ada@example.com", "   ", goodPassword), "name"},
		{"one character name", signupBody("ada@example.com", "A", goodPassword), "name"},
		{"name too long", signupBody("ada@example.com", strings.Repeat("a", 33), goodPassword), "name"},
		{"name with control characters", signupBody("ada@example.com", "Ada\x00Lovelace", goodPassword), "name"},
		{"short password", signupBody("ada@example.com", "Ada", "123456789"), "password"},
		{"password too long", signupBody("ada@example.com", "Ada", strings.Repeat("a", 129)), "password"},
		{"not json", "email=ada@example.com", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := newApp(t)

			rec := a.post("/api/auth/signup", tc.body)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusBadRequest, rec.Body)
			}
			if tc.wantField != "" && !strings.Contains(strings.ToLower(rec.Body.String()), tc.wantField) {
				t.Fatalf("error %s does not mention %q", rec.Body, tc.wantField)
			}
			if n := len(a.mail.Sent()); n != 0 {
				t.Fatalf("emails sent = %d, want 0", n)
			}
			if _, err := a.queries.GetUserByEmail(t.Context(), "ada@example.com"); err == nil {
				t.Fatal("a user was stored for an invalid request")
			}
		})
	}
}

func TestSignUpRefusesADuplicateEmailOrName(t *testing.T) {
	cases := []struct {
		name      string
		body      string
		wantField string
	}{
		{"same email", signupBody("ada@example.com", "Someone Else", goodPassword), "email"},
		{"same email in other case", signupBody("ADA@Example.COM", "Someone Else", goodPassword), "email"},
		{"same name", signupBody("other@example.com", "Ada", goodPassword), "name"},
		{"same name in other case", signupBody("other@example.com", "aDa", goodPassword), "name"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := newApp(t)
			if rec := a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword)); rec.Code != http.StatusCreated {
				t.Fatalf("first sign up: status = %d, body %s", rec.Code, rec.Body)
			}

			rec := a.post("/api/auth/signup", tc.body)

			if rec.Code != http.StatusConflict {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusConflict, rec.Body)
			}
			if !strings.Contains(strings.ToLower(rec.Body.String()), tc.wantField) {
				t.Fatalf("error %s does not mention %q", rec.Body, tc.wantField)
			}
			if n := len(a.mail.Sent()); n != 1 {
				t.Fatalf("emails sent = %d, want only the first account's", n)
			}
		})
	}
}

func tokenFromEmail(t *testing.T, text string) string {
	t.Helper()
	_, rest, found := strings.Cut(text, "token=")
	if !found {
		t.Fatalf("no token in email:\n%s", text)
	}
	return strings.Fields(rest)[0]
}

func verifyBody(token string) string {
	b, _ := json.Marshal(map[string]string{"token": token})
	return string(b)
}

func TestVerifyEmailMarksTheUserVerified(t *testing.T) {
	a := newApp(t)
	a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))
	token := tokenFromEmail(t, a.mail.Sent()[0].Text)
	a.clock.Advance(time.Hour)

	rec := a.post("/api/auth/verify-email", verifyBody(token))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusNoContent, rec.Body)
	}
	stored, err := a.queries.GetUserByEmail(t.Context(), "ada@example.com")
	if err != nil {
		t.Fatalf("reading the user back: %v", err)
	}
	if !stored.EmailVerifiedAt.Valid || !stored.EmailVerifiedAt.Time.Equal(a.clock.Now()) {
		t.Fatalf("email_verified_at = %v, want %v", stored.EmailVerifiedAt, a.clock.Now())
	}
}

func assertUnverified(t *testing.T, a *app, email string) {
	t.Helper()
	stored, err := a.queries.GetUserByEmail(t.Context(), email)
	if err != nil {
		t.Fatalf("reading the user back: %v", err)
	}
	if stored.EmailVerifiedAt.Valid {
		t.Fatal("user is verified, want unverified")
	}
}

func TestVerifyEmailRejectsBadTokens(t *testing.T) {
	t.Run("a token that was already used", func(t *testing.T) {
		a := newApp(t)
		a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))
		token := tokenFromEmail(t, a.mail.Sent()[0].Text)
		if rec := a.post("/api/auth/verify-email", verifyBody(token)); rec.Code != http.StatusNoContent {
			t.Fatalf("first use: status = %d, want %d", rec.Code, http.StatusNoContent)
		}

		rec := a.post("/api/auth/verify-email", verifyBody(token))

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("second use: status = %d, want %d", rec.Code, http.StatusBadRequest)
		}
	})

	t.Run("an expired token", func(t *testing.T) {
		a := newApp(t)
		a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))
		token := tokenFromEmail(t, a.mail.Sent()[0].Text)
		a.clock.Advance(24 * time.Hour) // the token's lifetime is up exactly now

		rec := a.post("/api/auth/verify-email", verifyBody(token))

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
		}
		assertUnverified(t, a, "ada@example.com")
	})

	t.Run("a token that is still valid just before it expires", func(t *testing.T) {
		a := newApp(t)
		a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))
		token := tokenFromEmail(t, a.mail.Sent()[0].Text)
		a.clock.Advance(24*time.Hour - time.Second)

		rec := a.post("/api/auth/verify-email", verifyBody(token))

		if rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
		}
	})

	for _, token := range []string{"", "not-a-real-token", strings.Repeat("A", 43)} {
		t.Run("an unknown token "+token, func(t *testing.T) {
			a := newApp(t)
			a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))

			rec := a.post("/api/auth/verify-email", verifyBody(token))

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
			}
			assertUnverified(t, a, "ada@example.com")
		})
	}
}

func TestVerifyEmailTokenWorksOnceEvenWhenUsedTwiceAtTheSameTime(t *testing.T) {
	a := newApp(t)
	a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))
	token := tokenFromEmail(t, a.mail.Sent()[0].Text)

	const attempts = 8
	codes := make(chan int, attempts)
	for range attempts {
		go func() { codes <- a.post("/api/auth/verify-email", verifyBody(token)).Code }()
	}
	succeeded := 0
	for range attempts {
		if <-codes == http.StatusNoContent {
			succeeded++
		}
	}

	if succeeded != 1 {
		t.Fatalf("%d of %d simultaneous uses succeeded, want exactly 1", succeeded, attempts)
	}
}

func resendBody(email string) string {
	b, _ := json.Marshal(map[string]string{"email": email})
	return string(b)
}

func TestResendVerificationSendsAFreshLinkAndKillsTheOldOne(t *testing.T) {
	a := newApp(t)
	a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))
	oldToken := tokenFromEmail(t, a.mail.Sent()[0].Text)

	rec := a.post("/api/auth/resend-verification", resendBody("Ada@Example.com"))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusOK, rec.Body)
	}
	sent := a.mail.Sent()
	if len(sent) != 2 || sent[1].To != "ada@example.com" {
		t.Fatalf("emails sent = %+v, want a second one to ada@example.com", sent)
	}
	newToken := tokenFromEmail(t, sent[1].Text)
	if newToken == oldToken {
		t.Fatal("resend reused the old token")
	}
	if rec := a.post("/api/auth/verify-email", verifyBody(oldToken)); rec.Code != http.StatusBadRequest {
		t.Fatalf("old token: status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
	if rec := a.post("/api/auth/verify-email", verifyBody(newToken)); rec.Code != http.StatusNoContent {
		t.Fatalf("new token: status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestResendVerificationDoesNotRevealWhichEmailsHaveAccounts(t *testing.T) {
	a := newApp(t)
	a.post("/api/auth/signup", signupBody("unverified@example.com", "Unverified", goodPassword))
	a.post("/api/auth/signup", signupBody("verified@example.com", "Verified", goodPassword))
	a.post("/api/auth/verify-email", verifyBody(tokenFromEmail(t, a.mail.Sent()[1].Text)))
	sentBefore := len(a.mail.Sent())

	unverified := a.post("/api/auth/resend-verification", resendBody("unverified@example.com"))
	verified := a.post("/api/auth/resend-verification", resendBody("verified@example.com"))
	unknown := a.post("/api/auth/resend-verification", resendBody("nobody@example.com"))

	for name, rec := range map[string]*httptest.ResponseRecorder{"verified": verified, "unknown": unknown} {
		if rec.Code != unverified.Code {
			t.Errorf("%s: status = %d, differs from the unverified case (%d)", name, rec.Code, unverified.Code)
		}
	}
	if verified.Body.String() != unverified.Body.String() || unknown.Body.String() != unverified.Body.String() {
		t.Fatalf("response bodies differ:\nunverified: %s\nverified: %s\nunknown: %s", unverified.Body, verified.Body, unknown.Body)
	}
	if got := len(a.mail.Sent()) - sentBefore; got != 1 {
		t.Fatalf("emails sent by the three requests = %d, want 1 (only the unverified account)", got)
	}
}

func assertTooManyRequests(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusTooManyRequests, rec.Body)
	}
	secs, err := strconv.Atoi(rec.Header().Get("Retry-After"))
	if err != nil || secs <= 0 {
		t.Fatalf("Retry-After = %q, want a positive number of seconds", rec.Header().Get("Retry-After"))
	}
}

func TestSignUpIsRateLimitedPerIP(t *testing.T) {
	a := newApp(t, func(c *handler.ApiConfig) { c.Limits.SignupPerIP = 2 })
	signUpAs := func(ip, n string) *httptest.ResponseRecorder {
		return a.postFrom(ip, "/api/auth/signup", signupBody(n+"@example.com", "User "+n, goodPassword))
	}

	for _, n := range []string{"one", "two"} {
		if rec := signUpAs("203.0.113.7", n); rec.Code != http.StatusCreated {
			t.Fatalf("sign up %s: status = %d, want %d", n, rec.Code, http.StatusCreated)
		}
	}
	blocked := signUpAs("203.0.113.7", "three")
	assertTooManyRequests(t, blocked)
	if _, err := a.queries.GetUserByEmail(t.Context(), "three@example.com"); err == nil {
		t.Fatal("a rate-limited request still created a user")
	}

	if rec := signUpAs("198.51.100.9", "four"); rec.Code != http.StatusCreated {
		t.Fatalf("a different IP: status = %d, want %d", rec.Code, http.StatusCreated)
	}

	a.clock.Advance(time.Hour)
	if rec := signUpAs("203.0.113.7", "five"); rec.Code != http.StatusCreated {
		t.Fatalf("after the window: status = %d, want %d", rec.Code, http.StatusCreated)
	}
}

func TestResendVerificationIsRateLimitedPerEmailEvenForUnknownAddresses(t *testing.T) {
	a := newApp(t, func(c *handler.ApiConfig) { c.Limits.ResendPerEmail = 2 })
	resend := func(email string) *httptest.ResponseRecorder {
		return a.post("/api/auth/resend-verification", resendBody(email))
	}

	// "nobody@" has no account. It must be limited exactly like a real address,
	// or the 429 would reveal which emails are registered.
	for range 2 {
		if rec := resend("nobody@example.com"); rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
		}
	}
	assertTooManyRequests(t, resend("nobody@example.com"))
	assertTooManyRequests(t, resend("NOBODY@example.com"))

	if rec := resend("someone-else@example.com"); rec.Code != http.StatusOK {
		t.Fatalf("a different email: status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestResendVerificationIsRateLimitedPerIP(t *testing.T) {
	a := newApp(t, func(c *handler.ApiConfig) { c.Limits.ResendPerIP = 2 })
	resendFrom := func(ip, email string) *httptest.ResponseRecorder {
		return a.postFrom(ip, "/api/auth/resend-verification", resendBody(email))
	}

	resendFrom("203.0.113.7", "a@example.com")
	resendFrom("203.0.113.7", "b@example.com")
	assertTooManyRequests(t, resendFrom("203.0.113.7", "c@example.com"))

	if rec := resendFrom("198.51.100.9", "c@example.com"); rec.Code != http.StatusOK {
		t.Fatalf("a different IP: status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestSignUpCreatesAnUnverifiedUserAndEmailsAVerificationLink(t *testing.T) {
	a := newApp(t)

	rec := a.post("/api/auth/signup", signupBody("  Ada@Example.com ", "Ada", goodPassword))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusCreated, rec.Body)
	}
	var user struct {
		ID    int32  `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&user); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if user.Email != "ada@example.com" || user.Name != "Ada" || user.ID == 0 {
		t.Fatalf("response user = %+v, want normalized email, name Ada and an id", user)
	}

	sent := a.mail.Sent()
	if len(sent) != 1 {
		t.Fatalf("emails sent = %d, want 1", len(sent))
	}
	if sent[0].To != "ada@example.com" {
		t.Fatalf("email sent to %q, want ada@example.com", sent[0].To)
	}
	if !strings.Contains(sent[0].Text, frontendOrigin+"/verify-email?token=") {
		t.Fatalf("email has no verification link, text:\n%s", sent[0].Text)
	}

	// No read endpoint exists, so inspect the stored row through the data layer.
	stored, err := a.queries.GetUserByEmail(t.Context(), "ada@example.com")
	if err != nil {
		t.Fatalf("reading the user back: %v", err)
	}
	if stored.EmailVerifiedAt.Valid {
		t.Fatal("a new user must be unverified")
	}
	if !strings.HasPrefix(stored.PasswordHash, "$argon2id$") || strings.Contains(stored.PasswordHash, goodPassword) {
		t.Fatalf("password_hash = %q, want an argon2id hash that does not contain the password", stored.PasswordHash)
	}
}
