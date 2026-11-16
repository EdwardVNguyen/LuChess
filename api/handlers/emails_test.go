package handler_test

import (
	"bytes"
	"context"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/EdwardVNguyen/LuChess/api/internal/mailer"
)

// gatedMailer holds every email until release is closed, like a provider that
// is slow to answer. It records the email and whether its context was still live.
type gatedMailer struct {
	started chan mailer.Message
	release chan struct{}
	ctxErrs chan error
}

func newGatedMailer() *gatedMailer {
	return &gatedMailer{started: make(chan mailer.Message, 10), release: make(chan struct{}), ctxErrs: make(chan error, 10)}
}

func (m *gatedMailer) Send(ctx context.Context, msg mailer.Message) error {
	m.started <- msg
	<-m.release
	m.ctxErrs <- ctx.Err()
	return nil
}

// failingMailer fails like an SMTP provider refusing the login.
type failingMailer struct{}

const providerError = "smtp: authenticating: 535 5.7.8 smtp.provider.example: bad credentials"

func (failingMailer) Send(context.Context, mailer.Message) error {
	return errors.New(providerError)
}

// captureLog sends the standard logger to a buffer for the rest of the test.
func captureLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	old := log.Writer()
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(old) })
	return &buf
}

// serveWithoutWaiting performs a request and returns as soon as it is answered,
// without waiting for the emails it started, with a context that ends with it.
func (a *app) serveWithoutWaiting(path, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req := httptest.NewRequestWithContext(ctx, http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.1:40000"
	rec := httptest.NewRecorder()
	a.router.ServeHTTP(rec, req)
	return rec
}

func TestEmailsAreSentAfterTheAnswerWithAContextThatOutlivesTheRequest(t *testing.T) {
	gate := newGatedMailer()
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	a.post("/api/auth/signup", signupBody("bob@example.com", "Bob", goodPassword))
	a.cfg.Mailer = gate

	cases := []struct {
		name, path, body, wantTo, wantLink string
		wantCode                           int
	}{
		{"sign-up", "/api/auth/signup", signupBody("cy@example.com", "Cy", goodPassword), "cy@example.com", "/verify-email?token=", http.StatusCreated},
		{"resend verification", "/api/auth/resend-verification", resendBody("bob@example.com"), "bob@example.com", "/verify-email?token=", http.StatusOK},
		{"forgot password", "/api/auth/forgot-password", forgotBody("ada@example.com"), "ada@example.com", "/reset-password?token=", http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// The mailer holds the email, so the request can only be answered if it does not wait for it
			rec := a.serveWithoutWaiting(tc.path, tc.body)

			if rec.Code != tc.wantCode {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tc.wantCode, rec.Body)
			}
			msg := <-gate.started
			if msg.To != tc.wantTo || !strings.Contains(msg.Text, frontendOrigin+tc.wantLink) {
				t.Fatalf("email = %+v, want one to %s with a %s link", msg, tc.wantTo, tc.wantLink)
			}
		})
	}

	close(gate.release)
	a.cfg.WaitForEmails()
	for range cases {
		if err := <-gate.ctxErrs; err != nil {
			t.Errorf("an email's context ended with its request: %v", err)
		}
	}
}

// The account is looked up only after the answer, so the answer and its timing
// cannot depend on it: here they do not even need the database.
func TestForgotPasswordAndResendAnswerTheSameWithoutLookingTheEmailUp(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	a.post("/api/auth/signup", signupBody("bob@example.com", "Bob", goodPassword))
	logged := captureLog(t)
	a.db.Close()

	for path, bodies := range map[string][]string{
		"/api/auth/forgot-password":     {forgotBody("ada@example.com"), forgotBody("nobody@example.com")},
		"/api/auth/resend-verification": {resendBody("bob@example.com"), resendBody("ada@example.com"), resendBody("nobody@example.com")},
	} {
		var first *httptest.ResponseRecorder
		for _, body := range bodies {
			rec := a.post(path, body)
			if rec.Code != http.StatusOK {
				t.Fatalf("%s %s: status = %d, want %d (body %s)", path, body, rec.Code, http.StatusOK, rec.Body)
			}
			if first == nil {
				first = rec
			} else if rec.Body.String() != first.Body.String() {
				t.Fatalf("%s: answers differ:\n%s\n%s", path, first.Body, rec.Body)
			}
		}
	}
	if n := strings.Count(logged.String(), "error: "); n != 5 {
		t.Errorf("logged %d errors, want one for each request:\n%s", n, logged)
	}
}

func TestAFailedEmailIsLoggedAndTheClientHearsNothingOfTheProvider(t *testing.T) {
	a := newApp(t)
	a.verifiedUser("ada@example.com", "Ada", goodPassword)
	a.post("/api/auth/signup", signupBody("bob@example.com", "Bob", goodPassword))
	signUpOK := a.post("/api/auth/signup", signupBody("cy@example.com", "Cy", goodPassword))
	resendOK := a.post("/api/auth/resend-verification", resendBody("bob@example.com"))
	forgotOK := a.post("/api/auth/forgot-password", forgotBody("ada@example.com"))
	a.cfg.Mailer = failingMailer{}
	logged := captureLog(t)

	cases := []struct {
		name, path, body string
		ok               *httptest.ResponseRecorder
		wantLog          string
	}{
		{"sign-up", "/api/auth/signup", signupBody("dee@example.com", "Dee", goodPassword), signUpOK, "sending verification email to user"},
		{"resend verification", "/api/auth/resend-verification", resendBody("bob@example.com"), resendOK, "resending verification email to user"},
		{"forgot password", "/api/auth/forgot-password", forgotBody("ada@example.com"), forgotOK, "sending reset email to user"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			logged.Reset()

			rec := a.post(tc.path, tc.body)

			if rec.Code != tc.ok.Code {
				t.Fatalf("status = %d, want %d as when the email is sent", rec.Code, tc.ok.Code)
			}
			if strings.Contains(strings.ToLower(rec.Body.String()), "smtp") || strings.Contains(rec.Body.String(), "provider") {
				t.Errorf("the answer mentions the email provider: %s", rec.Body)
			}
			if tc.path != "/api/auth/signup" && rec.Body.String() != tc.ok.Body.String() {
				t.Errorf("answer = %s, want the same as when the email is sent: %s", rec.Body, tc.ok.Body)
			}
			if !strings.Contains(logged.String(), tc.wantLog) || !strings.Contains(logged.String(), providerError) {
				t.Errorf("log = %q, want %q and the mailer's error", logged, tc.wantLog)
			}
		})
	}
}

func TestTheVerificationEmailUsesTheSitesName(t *testing.T) {
	a := newApp(t)

	a.post("/api/auth/signup", signupBody("ada@example.com", "Ada", goodPassword))

	msg := a.mail.Sent()[0]
	if msg.Subject != "Verify your LuChess email" || !strings.HasPrefix(msg.Text, "Welcome to LuChess!") {
		t.Fatalf("subject %q and text %q, want the site's name, LuChess", msg.Subject, msg.Text)
	}
	if strings.Contains(msg.Subject+msg.Text, "ChessNotes") {
		t.Fatalf("the email still says ChessNotes:\n%s\n%s", msg.Subject, msg.Text)
	}
}
