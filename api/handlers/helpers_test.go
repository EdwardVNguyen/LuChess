package handler_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	handler "github.com/EdwardVNguyen/ChessNotes/api/handlers"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/mailer/mailertest"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/password"
	sessions "github.com/EdwardVNguyen/ChessNotes/api/internal/session"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/testdb"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

// app is the API wired to a real, isolated database. Only the edges are
// controlled: the mailer records instead of sending, and time is fake.
type app struct {
	t       *testing.T
	router  http.Handler
	queries *database.Queries
	mail    *mailertest.Recorder
	clock   *fakeClock
}

func newApp(t *testing.T, tweak ...func(*handler.ApiConfig)) *app {
	t.Helper()
	db := testdb.New(t)
	a := &app{
		t:       t,
		queries: database.New(db),
		mail:    &mailertest.Recorder{},
		clock:   &fakeClock{now: time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)},
	}
	cfg := &handler.ApiConfig{
		Db:             a.queries,
		SQL:            db,
		FrontendOrigin: frontendOrigin,
		Mailer:         a.mail,
		// Cheap enough for tests; production uses password.DefaultHasher
		Hasher: password.Hasher{MemoryKiB: 8, Iterations: 1, Parallelism: 1, SaltLen: 16, KeyLen: 32},
		Now:    a.clock.Now,
		// High enough that ordinary tests never trip them; limit tests lower them
		Limits: handler.RateLimits{
			SignupPerIP: 1000, ResendPerEmail: 1000, ResendPerIP: 1000,
			LoginPerEmail: 1000, LoginPerIP: 1000, RefreshPerIP: 1000,
		},
		Session:      sessions.New(sessions.Config{DB: db, Secret: []byte(testJWTSecret), Now: a.clock.Now}),
		CookieSecure: true,
	}
	for _, f := range tweak {
		f(cfg)
	}
	a.router = handler.NewRouter(cfg)
	return a
}

const testJWTSecret = "test-secret-that-is-at-least-32-bytes-long!!"

func (a *app) post(path, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.postFrom("192.0.2.1", path, body)
}

func (a *app) postFrom(ip, path, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodPost, path, body, func(r *http.Request) { r.RemoteAddr = ip + ":40000" })
}

// send performs a request against the router. tweak can set headers, cookies or the remote address.
func (a *app) send(method, path, body string, tweak ...func(*http.Request)) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.1:40000"
	for _, f := range tweak {
		f(req)
	}
	rec := httptest.NewRecorder()
	a.router.ServeHTTP(rec, req)
	return rec
}

func withBearer(token string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+token) }
}

func withRefreshCookie(token string) func(*http.Request) {
	return func(r *http.Request) { r.AddCookie(&http.Cookie{Name: "refresh_token", Value: token}) }
}

func fromFrontend(r *http.Request) { r.Header.Set("Origin", frontendOrigin) }

func (a *app) fromIP(ip string) func(*http.Request) {
	return func(r *http.Request) { r.RemoteAddr = ip + ":40000" }
}

// refreshCookie returns the refresh_token cookie a response set, or nil.
func refreshCookie(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == "refresh_token" {
			return c
		}
	}
	return nil
}

// verifiedUser signs a user up and verifies their email, as a real user would.
func (a *app) verifiedUser(email, name, password string) {
	a.t.Helper()
	before := len(a.mail.Sent())
	if rec := a.post("/api/auth/signup", signupBody(email, name, password)); rec.Code != http.StatusCreated {
		a.t.Fatalf("sign up %s: status = %d (body %s)", email, rec.Code, rec.Body)
	}
	token := tokenFromEmail(a.t, a.mail.Sent()[before].Text)
	if rec := a.post("/api/auth/verify-email", verifyBody(token)); rec.Code != http.StatusNoContent {
		a.t.Fatalf("verify %s: status = %d (body %s)", email, rec.Code, rec.Body)
	}
}
