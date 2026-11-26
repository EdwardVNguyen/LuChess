package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/EdwardVNguyen/LuChess/api/internal/database"
	"github.com/EdwardVNguyen/LuChess/api/internal/mailer"
	"github.com/EdwardVNguyen/LuChess/api/internal/ratelimit"
	"github.com/EdwardVNguyen/LuChess/api/utils"
	"github.com/lib/pq"
)

const (
	verifyTokenTTL = 24 * time.Hour
	// Bounds one background email, so a stuck provider cannot hold it forever
	emailTimeout = time.Minute
)

// newToken returns a random token for an email link, plus the hash that is
// stored. The token itself is never stored.
func newToken() (token string, hash []byte, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, hashToken(token), nil
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

type publicUser struct {
	ID    int32  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// clientIP is the address the per-IP rate limits count against: the address of
// the connection, or with TrustProxyHeaders the visitor's address as Cloudflare
// reports it. No other forwarding header is read, since a visitor can put
// anything in them.
func (cfg *ApiConfig) clientIP(r *http.Request) string {
	if cfg.TrustProxyHeaders {
		// The parsed form, so two spellings of one address share a budget
		if ip := net.ParseIP(r.Header.Get("CF-Connecting-IP")); ip != nil {
			return ip.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// allow spends one event from the limiter for key. When the key is over its
// limit it answers 429 with Retry-After and returns false.
func (cfg *ApiConfig) allow(w http.ResponseWriter, limiter *ratelimit.Limiter, key string) bool {
	ok, retryAfter := limiter.Allow(key, cfg.now())
	if ok {
		return true
	}
	w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retryAfter.Seconds()))))
	utils.RespondError(w, http.StatusTooManyRequests, "Too many requests. Please try again later.", nil)
	return false
}

func (cfg *ApiConfig) HandleSignUp(w http.ResponseWriter, r *http.Request) {
	if !cfg.allow(w, cfg.signupByIP, cfg.clientIP(r)) {
		return
	}
	var p struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	email := normalizeEmail(p.Email)
	name := strings.TrimSpace(p.Name)
	for _, err := range []error{validateEmail(email), validateName(name), validatePassword(p.Password)} {
		if err != nil {
			utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
	}

	hash, err := cfg.Hasher.Hash(p.Password)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create user", err)
		return
	}
	token, tokenHash, err := newToken()
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create user", err)
		return
	}

	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create user", err)
		return
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	user, err := q.CreateUser(r.Context(), database.CreateUserParams{
		Email:        email,
		Name:         name,
		PasswordHash: hash,
	})
	if err != nil {
		if msg, taken := uniqueViolationMessage(err); taken {
			utils.RespondError(w, http.StatusConflict, msg, nil)
			return
		}
		utils.RespondError(w, http.StatusInternalServerError, "Could not create user", err)
		return
	}
	if err := q.CreateEmailToken(r.Context(), database.CreateEmailTokenParams{
		UserID:    user.ID,
		Purpose:   database.EmailTokenPurposeVerify,
		TokenHash: tokenHash,
		ExpiresAt: cfg.now().Add(verifyTokenTTL),
	}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create user", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create user", err)
		return
	}

	// The account exists even if this fails; the user can ask for another email.
	cfg.inBackground(func(ctx context.Context) error {
		if err := cfg.sendVerificationEmail(ctx, user.Email, token); err != nil {
			return fmt.Errorf("sending verification email to user %d: %w", user.ID, err)
		}
		return nil
	})

	utils.RespondJSON(w, http.StatusCreated, publicUser{ID: user.ID, Email: user.Email, Name: user.Name})
}

func (cfg *ApiConfig) HandleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var p struct {
		Token string `json:"token"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}

	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not verify email", err)
		return
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	now := cfg.now()
	userID, err := q.ConsumeEmailToken(r.Context(), database.ConsumeEmailTokenParams{
		TokenHash: hashToken(p.Token),
		Purpose:   database.EmailTokenPurposeVerify,
		Now:       sql.NullTime{Time: now, Valid: true},
	})
	if errors.Is(err, sql.ErrNoRows) {
		utils.RespondError(w, http.StatusBadRequest, "This verification link is invalid or has expired", nil)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not verify email", err)
		return
	}
	if err := q.MarkEmailVerified(r.Context(), database.MarkEmailVerifiedParams{ID: userID, Now: now}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not verify email", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not verify email", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (cfg *ApiConfig) HandleResendVerification(w http.ResponseWriter, r *http.Request) {
	if !cfg.allow(w, cfg.resendByIP, cfg.clientIP(r)) {
		return
	}
	var p struct {
		Email string `json:"email"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	email := normalizeEmail(p.Email)
	// Checked before looking the account up, so unknown addresses are limited
	// exactly like real ones and a 429 reveals nothing.
	if !cfg.allow(w, cfg.resendByEmail, email) {
		return
	}

	// Whether the email has an unverified account is only looked at after the
	// answer, which is the same either way, so neither the answer nor how long it
	// takes reveals who is registered.
	cfg.inBackground(func(ctx context.Context) error { return cfg.resendVerification(ctx, email) })
	utils.RespondJSON(w, http.StatusOK, map[string]string{
		"message": "If that email belongs to an unverified account, we have sent a new verification link.",
	})
}

// resendVerification replaces any unused verification link of the unverified
// account with this email, and sends the new one. Unknown and verified emails get nothing.
func (cfg *ApiConfig) resendVerification(ctx context.Context, email string) error {
	user, err := cfg.Db.GetUserByEmail(ctx, email)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && user.EmailVerifiedAt.Valid) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("resending verification email: %w", err)
	}
	fail := func(err error) error {
		return fmt.Errorf("resending verification email to user %d: %w", user.ID, err)
	}

	token, tokenHash, err := newToken()
	if err != nil {
		return fail(err)
	}
	tx, err := cfg.SQL.BeginTx(ctx, nil)
	if err != nil {
		return fail(err)
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	if err := q.DeleteUnusedEmailTokens(ctx, database.DeleteUnusedEmailTokensParams{
		UserID:  user.ID,
		Purpose: database.EmailTokenPurposeVerify,
	}); err != nil {
		return fail(err)
	}
	if err := q.CreateEmailToken(ctx, database.CreateEmailTokenParams{
		UserID:    user.ID,
		Purpose:   database.EmailTokenPurposeVerify,
		TokenHash: tokenHash,
		ExpiresAt: cfg.now().Add(verifyTokenTTL),
	}); err != nil {
		return fail(err)
	}
	if err := tx.Commit(); err != nil {
		return fail(err)
	}

	if err := cfg.sendVerificationEmail(ctx, user.Email, token); err != nil {
		return fail(err)
	}
	return nil
}

// uniqueViolationMessage turns a taken email or display name into a message for
// the user. The database constraints decide, so simultaneous sign-ups cannot both win.
// Revealing a taken email here is deliberate (ADR 0004).
func uniqueViolationMessage(err error) (string, bool) {
	var pqErr *pq.Error
	if !errors.As(err, &pqErr) || pqErr.Code != "23505" {
		return "", false
	}
	switch pqErr.Constraint {
	case "users_email_key":
		return "An account with this email already exists", true
	case "users_name_lower_key":
		return "That display name is already taken", true
	}
	return "", false
}

func (cfg *ApiConfig) sendVerificationEmail(ctx context.Context, to, token string) error {
	link := fmt.Sprintf("%s/verify-email?token=%s", cfg.FrontendOrigin, token)
	return cfg.Mailer.Send(ctx, mailer.Message{
		To:      to,
		Subject: "Verify your LuChess email",
		Text: "Welcome to LuChess!\n\n" +
			"Confirm your email address by opening this link within 24 hours:\n\n" + link + "\n\n" +
			"If you did not create an account, you can ignore this email.\n",
	})
}

// inBackground runs work after the request is answered, so no answer waits on
// the email provider. work gets a context of its own, since the request's ends
// with the answer, and its error is logged because nobody is left to tell.
func (cfg *ApiConfig) inBackground(work func(ctx context.Context) error) {
	cfg.emails.Go(func() {
		ctx, cancel := context.WithTimeout(context.Background(), emailTimeout)
		defer cancel()
		if err := work(ctx); err != nil {
			log.Printf("error: %s", err)
		}
	})
}

// WaitForEmails returns once every email started in the background has been
// sent or has failed.
func (cfg *ApiConfig) WaitForEmails() {
	cfg.emails.Wait()
}
