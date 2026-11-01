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
		Limits: handler.RateLimits{SignupPerIP: 1000, ResendPerEmail: 1000, ResendPerIP: 1000},
	}
	for _, f := range tweak {
		f(cfg)
	}
	a.router = handler.NewRouter(cfg)
	return a
}

func (a *app) post(path, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.postFrom("192.0.2.1", path, body)
}

func (a *app) postFrom(ip, path, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = ip + ":40000"
	rec := httptest.NewRecorder()
	a.router.ServeHTTP(rec, req)
	return rec
}
