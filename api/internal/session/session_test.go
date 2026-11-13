package session_test

import (
	"database/sql"
	"errors"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/EdwardVNguyen/LuChess/api/internal/database"
	"github.com/EdwardVNguyen/LuChess/api/internal/session"
	"github.com/EdwardVNguyen/LuChess/api/internal/testdb"
	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-that-is-at-least-32-bytes-long!!"

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

// world is the Session module over a real, isolated database and a fake clock.
type world struct {
	t        *testing.T
	db       *sql.DB
	sessions *session.Service
	queries  *database.Queries
	clock    *fakeClock
}

func newWorld(t *testing.T) *world {
	t.Helper()
	db := testdb.New(t)
	clock := &fakeClock{now: time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)}
	return &world{
		t:        t,
		db:       db,
		sessions: session.New(session.Config{DB: db, Secret: []byte(testSecret), Now: clock.Now}),
		queries:  database.New(db),
		clock:    clock,
	}
}

func (w *world) user(email, name string) database.User {
	w.t.Helper()
	u, err := w.queries.CreateUser(w.t.Context(), database.CreateUserParams{
		Email:        email,
		Name:         name,
		PasswordHash: "not used by sessions",
		Biography:    sql.NullString{},
		AvatarUrl:    sql.NullString{},
	})
	if err != nil {
		w.t.Fatalf("creating user %s: %v", email, err)
	}
	return u
}

func TestStartThenAuthenticateReturnsTheUser(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")

	tokens, err := w.sessions.Start(t.Context(), ada.ID)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	got, err := w.sessions.Authenticate(t.Context(), tokens.Access)

	if err != nil {
		t.Fatalf("Authenticate: %v", err)
	}
	if got.ID != ada.ID || got.Email != "ada@example.com" {
		t.Fatalf("Authenticate returned %+v, want Ada", got)
	}
	if tokens.Refresh == "" {
		t.Fatal("Start returned no refresh token")
	}
}

func signedToken(t *testing.T, method jwt.SigningMethod, key any, claims jwt.RegisteredClaims) string {
	t.Helper()
	tok, err := jwt.NewWithClaims(method, claims).SignedString(key)
	if err != nil {
		t.Fatalf("signing test token: %v", err)
	}
	return tok
}

func TestAuthenticateRejectsBadAccessTokens(t *testing.T) {
	secret := []byte(testSecret)
	claims := func(w *world, sub string, exp time.Duration) jwt.RegisteredClaims {
		now := w.clock.Now()
		return jwt.RegisteredClaims{Subject: sub, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(exp))}
	}
	cases := []struct {
		name  string
		token func(t *testing.T, w *world, ada database.User, issued session.Tokens) string
	}{
		{"empty", func(*testing.T, *world, database.User, session.Tokens) string { return "" }},
		{"garbage", func(*testing.T, *world, database.User, session.Tokens) string { return "not.a.jwt" }},
		{"tampered", func(_ *testing.T, _ *world, _ database.User, issued session.Tokens) string {
			return issued.Access[:len(issued.Access)-2] + "xx"
		}},
		{"signed with another secret", func(t *testing.T, w *world, ada database.User, _ session.Tokens) string {
			return signedToken(t, jwt.SigningMethodHS256, []byte("another-secret-that-is-32-bytes-long!!"), claims(w, strconv.Itoa(int(ada.ID)), time.Minute))
		}},
		{"signed with a different HMAC algorithm", func(t *testing.T, w *world, ada database.User, _ session.Tokens) string {
			return signedToken(t, jwt.SigningMethodHS512, secret, claims(w, strconv.Itoa(int(ada.ID)), time.Minute))
		}},
		{"unsigned (alg none)", func(t *testing.T, w *world, ada database.User, _ session.Tokens) string {
			return signedToken(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, claims(w, strconv.Itoa(int(ada.ID)), time.Minute))
		}},
		{"no expiry", func(t *testing.T, _ *world, ada database.User, _ session.Tokens) string {
			return signedToken(t, jwt.SigningMethodHS256, secret, jwt.RegisteredClaims{Subject: strconv.Itoa(int(ada.ID))})
		}},
		{"subject that is not a user id", func(t *testing.T, w *world, _ database.User, _ session.Tokens) string {
			return signedToken(t, jwt.SigningMethodHS256, secret, claims(w, "ada", time.Minute))
		}},
		{"a user that does not exist", func(t *testing.T, w *world, _ database.User, _ session.Tokens) string {
			return signedToken(t, jwt.SigningMethodHS256, secret, claims(w, "999999", time.Minute))
		}},
		{"expired", func(_ *testing.T, w *world, _ database.User, issued session.Tokens) string {
			w.clock.Advance(15 * time.Minute) // the lifetime is up exactly now
			return issued.Access
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := newWorld(t)
			ada := w.user("ada@example.com", "Ada")
			issued, err := w.sessions.Start(t.Context(), ada.ID)
			if err != nil {
				t.Fatalf("Start: %v", err)
			}

			_, err = w.sessions.Authenticate(t.Context(), tc.token(t, w, ada, issued))

			if !errors.Is(err, session.ErrUnauthenticated) {
				t.Fatalf("Authenticate error = %v, want ErrUnauthenticated", err)
			}
		})
	}
}

func TestAnAccessTokenIsStillValidJustBeforeItExpires(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	tokens, _ := w.sessions.Start(t.Context(), ada.ID)
	w.clock.Advance(15*time.Minute - time.Second)

	if _, err := w.sessions.Authenticate(t.Context(), tokens.Access); err != nil {
		t.Fatalf("Authenticate: %v", err)
	}
}

func TestAnAccessTokenOfADeletedUserIsRejected(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	tokens, _ := w.sessions.Start(t.Context(), ada.ID)
	if _, err := w.db.ExecContext(t.Context(), `DELETE FROM users WHERE id = $1`, ada.ID); err != nil {
		t.Fatalf("deleting user: %v", err)
	}

	_, err := w.sessions.Authenticate(t.Context(), tokens.Access)

	if !errors.Is(err, session.ErrUnauthenticated) {
		t.Fatalf("Authenticate error = %v, want ErrUnauthenticated", err)
	}
}

// leeway is how long a rotated refresh token is still accepted, per ADR-0004.
const leeway = 10 * time.Second

func TestRefreshRotatesTheTokenAndKeepsTheSessionGoing(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	first, _ := w.sessions.Start(t.Context(), ada.ID)
	w.clock.Advance(10 * time.Minute)

	user, next, err := w.sessions.Refresh(t.Context(), first.Refresh)

	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if user.ID != ada.ID {
		t.Fatalf("Refresh returned user %d, want Ada (%d)", user.ID, ada.ID)
	}
	if next.Access == "" || next.Access == first.Access || next.Refresh == "" || next.Refresh == first.Refresh {
		t.Fatalf("Refresh returned %+v, want new access and refresh tokens", next)
	}
	if _, err := w.sessions.Authenticate(t.Context(), next.Access); err != nil {
		t.Fatalf("the new access token: %v", err)
	}
	if _, _, err := w.sessions.Refresh(t.Context(), next.Refresh); err != nil {
		t.Fatalf("refreshing with the new token: %v", err)
	}
}

func TestTheOldRefreshTokenStopsWorkingOnceTheLeewayIsOver(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	first, _ := w.sessions.Start(t.Context(), ada.ID)
	if _, _, err := w.sessions.Refresh(t.Context(), first.Refresh); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	w.clock.Advance(leeway + time.Second)

	_, _, err := w.sessions.Refresh(t.Context(), first.Refresh)

	if !errors.Is(err, session.ErrEnded) {
		t.Fatalf("Refresh error = %v, want ErrEnded", err)
	}
}

func TestAnExpiredRefreshTokenEndsTheSessionWithoutTreatingItAsTheft(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	old, _ := w.sessions.Start(t.Context(), ada.ID)
	w.clock.Advance(29 * 24 * time.Hour)
	later, _ := w.sessions.Start(t.Context(), ada.ID) // a second device, logged in later
	w.clock.Advance(24 * time.Hour)                   // the first token's 30 days are now up

	_, _, err := w.sessions.Refresh(t.Context(), old.Refresh)

	if !errors.Is(err, session.ErrEnded) {
		t.Fatalf("expired token: error = %v, want ErrEnded", err)
	}
	if _, _, err := w.sessions.Refresh(t.Context(), later.Refresh); err != nil {
		t.Fatalf("the other device's session: %v, want it untouched", err)
	}
}

func TestReusingARotatedTokenAfterTheLeewayRevokesEverySessionOfThatUser(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	bob := w.user("bob@example.com", "Bob")
	phone, _ := w.sessions.Start(t.Context(), ada.ID)
	laptop, _ := w.sessions.Start(t.Context(), ada.ID)
	bobs, _ := w.sessions.Start(t.Context(), bob.ID)

	// The phone refreshes normally, then someone replays the token it just used
	_, phoneNow, err := w.sessions.Refresh(t.Context(), phone.Refresh)
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	w.clock.Advance(leeway + time.Second)
	_, _, replay := w.sessions.Refresh(t.Context(), phone.Refresh)

	if !errors.Is(replay, session.ErrEnded) {
		t.Fatalf("replayed token: error = %v, want ErrEnded", replay)
	}
	for name, token := range map[string]string{"the phone's current token": phoneNow.Refresh, "the laptop": laptop.Refresh} {
		if _, _, err := w.sessions.Refresh(t.Context(), token); !errors.Is(err, session.ErrEnded) {
			t.Errorf("%s: error = %v, want ErrEnded after the theft response", name, err)
		}
	}
	if _, _, err := w.sessions.Refresh(t.Context(), bobs.Refresh); err != nil {
		t.Fatalf("another user's session: %v, want it untouched", err)
	}
}

func TestAnAlreadyRotatedTokenIsExchangedAgainInsideTheLeeway(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	first, _ := w.sessions.Start(t.Context(), ada.ID)
	_, lost, err := w.sessions.Refresh(t.Context(), first.Refresh) // the response never reached the browser
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	seen := map[string]bool{first.Refresh: true, lost.Refresh: true}
	for i := range 3 {
		w.clock.Advance(leeway / 4)
		user, retry, err := w.sessions.Refresh(t.Context(), first.Refresh)
		if err != nil {
			t.Fatalf("retry #%d inside the leeway: %v", i+1, err)
		}
		if user.ID != ada.ID || seen[retry.Refresh] {
			t.Fatalf("retry #%d: user %d, refresh token %q; want Ada and a fresh refresh token", i+1, user.ID, retry.Refresh)
		}
		seen[retry.Refresh] = true
		if _, err := w.sessions.Authenticate(t.Context(), retry.Access); err != nil {
			t.Fatalf("retry #%d: the access token: %v", i+1, err)
		}
		if _, _, err := w.sessions.Refresh(t.Context(), retry.Refresh); err != nil {
			t.Fatalf("retry #%d: the fresh refresh token does not work: %v", i+1, err)
		}
	}
}

func TestEndIsSafeToRepeatAndToCallWithAnUnknownToken(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	tokens, _ := w.sessions.Start(t.Context(), ada.ID)

	for i, token := range []string{tokens.Refresh, tokens.Refresh, "", "not-a-real-token"} {
		if err := w.sessions.End(t.Context(), token); err != nil {
			t.Fatalf("End #%d: %v", i+1, err)
		}
	}
}

func TestEndingASessionLeavesTheUsersOtherSessionsAlone(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	phone, _ := w.sessions.Start(t.Context(), ada.ID)
	laptop, _ := w.sessions.Start(t.Context(), ada.ID)

	if err := w.sessions.End(t.Context(), phone.Refresh); err != nil {
		t.Fatalf("End: %v", err)
	}

	// Trying the phone's token again, now or much later, is not theft: it was
	// ended on purpose, never exchanged, so the laptop must stay logged in.
	laptopToken := laptop.Refresh
	for _, wait := range []time.Duration{0, leeway + time.Second} {
		w.clock.Advance(wait)
		if _, _, err := w.sessions.Refresh(t.Context(), phone.Refresh); !errors.Is(err, session.ErrEnded) {
			t.Fatalf("the phone after End: error = %v, want ErrEnded", err)
		}
		_, next, err := w.sessions.Refresh(t.Context(), laptopToken)
		if err != nil {
			t.Fatalf("the laptop: %v, want it untouched", err)
		}
		laptopToken = next.Refresh
	}
}

func TestSimultaneousRefreshesWithTheSameTokenAllSucceedAndEachResultKeepsWorking(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	first, _ := w.sessions.Start(t.Context(), ada.ID)

	const attempts = 6
	type result struct {
		tokens session.Tokens
		err    error
	}
	results := make(chan result, attempts)
	for range attempts {
		go func() {
			_, tokens, err := w.sessions.Refresh(t.Context(), first.Refresh)
			results <- result{tokens, err}
		}()
	}
	var got []session.Tokens
	for range attempts {
		r := <-results
		if r.err != nil {
			t.Fatalf("a simultaneous refresh failed: %v", r.err)
		}
		got = append(got, r.tokens)
	}

	// The loser of a race must not end up revoking the winner's new token
	for i, tokens := range got {
		if _, err := w.sessions.Authenticate(t.Context(), tokens.Access); err != nil {
			t.Errorf("refresh #%d: the access token: %v", i+1, err)
		}
		if _, _, err := w.sessions.Refresh(t.Context(), tokens.Refresh); err != nil {
			t.Errorf("refresh #%d: its refresh token does not work on the next refresh: %v", i+1, err)
		}
	}
}

func TestTheTheftResponseAlsoEndsTokensRotatedJustBefore(t *testing.T) {
	w := newWorld(t)
	ada := w.user("ada@example.com", "Ada")
	phone, _ := w.sessions.Start(t.Context(), ada.ID)
	laptop, _ := w.sessions.Start(t.Context(), ada.ID)
	if _, _, err := w.sessions.Refresh(t.Context(), laptop.Refresh); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	w.clock.Advance(leeway + time.Second)
	// The phone rotates, and then the laptop's old token is replayed: theft
	_, phoneNow, err := w.sessions.Refresh(t.Context(), phone.Refresh)
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if _, _, err := w.sessions.Refresh(t.Context(), laptop.Refresh); !errors.Is(err, session.ErrEnded) {
		t.Fatalf("replayed token: error = %v, want ErrEnded", err)
	}
	w.clock.Advance(time.Second)

	// Still inside the leeway of the phone's rotation, but its user was revoked since
	for name, token := range map[string]string{"the phone's old token": phone.Refresh, "the phone's new token": phoneNow.Refresh} {
		if _, _, err := w.sessions.Refresh(t.Context(), token); !errors.Is(err, session.ErrEnded) {
			t.Errorf("%s: error = %v, want ErrEnded", name, err)
		}
	}
}
