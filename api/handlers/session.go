package handler

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/password"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
	"github.com/golang-jwt/jwt/v5"
)

const (
	accessTokenTTL  = 15 * time.Minute
	refreshTokenTTL = 30 * 24 * time.Hour

	refreshCookieName = "refresh_token"
	// The cookie is only ever sent to the auth endpoints, never with other requests
	refreshCookiePath = "/api/auth"
)

func (cfg *ApiConfig) issueAccessToken(userID int32) (string, error) {
	now := cfg.now()
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   strconv.Itoa(int(userID)),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(accessTokenTTL)),
	}).SignedString(cfg.JWTSecret)
}

func (cfg *ApiConfig) refreshCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     refreshCookieName,
		Value:    value,
		Path:     refreshCookiePath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
}

func (cfg *ApiConfig) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, cfg.refreshCookie(token, int(refreshTokenTTL.Seconds())))
}

func (cfg *ApiConfig) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, cfg.refreshCookie("", -1))
}

type sessionResponse struct {
	AccessToken string     `json:"accessToken"`
	User        publicUser `json:"user"`
}

// newRefreshToken stores a new refresh token for the user and returns its value.
// q is the caller's handle, so a rotation can do this inside its transaction.
func (cfg *ApiConfig) newRefreshToken(ctx context.Context, q *database.Queries, userID int32) (string, error) {
	token, hash, err := newToken()
	if err != nil {
		return "", err
	}
	err = q.CreateRefreshToken(ctx, database.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: hash,
		ExpiresAt: cfg.now().Add(refreshTokenTTL),
	})
	return token, err
}

func (cfg *ApiConfig) respondWithSession(w http.ResponseWriter, user database.User, refreshToken string) {
	access, err := cfg.issueAccessToken(user.ID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not start a session", err)
		return
	}
	cfg.setRefreshCookie(w, refreshToken)
	w.Header().Set("Cache-Control", "no-store")
	utils.RespondJSON(w, http.StatusOK, sessionResponse{
		AccessToken: access,
		User:        publicUser{ID: user.ID, Email: user.Email, Name: user.Name},
	})
}

// requireFrontendOrigin is the CSRF guard for endpoints that act on the refresh
// cookie. Browsers always send Origin on a POST, and a forged cross-site request
// carries the attacker's, so anything but our frontend is refused.
func (cfg *ApiConfig) requireFrontendOrigin(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("Origin") == cfg.FrontendOrigin {
		return true
	}
	utils.RespondError(w, http.StatusForbidden, "Forbidden", nil)
	return false
}

func (cfg *ApiConfig) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if !cfg.allow(w, cfg.loginByIP, clientIP(r)) {
		return
	}
	var p struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &p) {
		return
	}
	email := normalizeEmail(p.Email)
	// Every attempt counts, successful or not, and an email with no account is
	// limited like any other, so a 429 reveals nothing.
	if !cfg.allow(w, cfg.loginByEmail, email) {
		return
	}
	invalid := func() {
		utils.RespondError(w, http.StatusUnauthorized, "Invalid email or password", nil)
	}

	user, err := cfg.Db.GetUserByEmail(r.Context(), email)
	if errors.Is(err, sql.ErrNoRows) {
		// Do the same hashing work as for a real account, so the time taken
		// does not reveal that this email has none.
		password.Verify(p.Password, cfg.dummyHash)
		invalid()
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not log in", err)
		return
	}
	if ok, err := password.Verify(p.Password, user.PasswordHash); err != nil || !ok {
		invalid()
		return
	}
	// Only someone who proved they know the password learns the account exists
	if !user.EmailVerifiedAt.Valid {
		utils.RespondError(w, http.StatusForbidden, "Verify your email before logging in. Check your inbox for the link, or ask for a new one.", nil)
		return
	}

	refresh, err := cfg.newRefreshToken(r.Context(), cfg.Db, user.ID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not log in", err)
		return
	}
	cfg.respondWithSession(w, user, refresh)
}

func (cfg *ApiConfig) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	if !cfg.requireFrontendOrigin(w, r) {
		return
	}
	if !cfg.allow(w, cfg.refreshByIP, clientIP(r)) {
		return
	}
	reject := func() {
		cfg.clearRefreshCookie(w)
		utils.RespondError(w, http.StatusUnauthorized, "Your session has ended. Please log in again.", nil)
	}

	cookie, err := r.Cookie(refreshCookieName)
	if err != nil || cookie.Value == "" {
		reject()
		return
	}
	hash := hashToken(cookie.Value)
	now := cfg.now()

	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not refresh your session", err)
		return
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	userID, err := q.RotateRefreshToken(r.Context(), database.RotateRefreshTokenParams{
		TokenHash: hash,
		Now:       sql.NullTime{Time: now, Valid: true},
	})
	if errors.Is(err, sql.ErrNoRows) {
		tx.Rollback()
		cfg.respondToFailedRefresh(r.Context(), hash)
		reject()
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not refresh your session", err)
		return
	}

	user, err := q.GetUserByID(r.Context(), userID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not refresh your session", err)
		return
	}
	next, err := cfg.newRefreshToken(r.Context(), q, userID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not refresh your session", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not refresh your session", err)
		return
	}

	cfg.respondWithSession(w, user, next)
}

// HandleLogout ends the session whose refresh cookie the request carries. It is
// safe to call repeatedly or without a cookie. The access token cannot be taken
// back, so it keeps working until it expires (at most 15 minutes).
func (cfg *ApiConfig) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if !cfg.requireFrontendOrigin(w, r) {
		return
	}
	if cookie, err := r.Cookie(refreshCookieName); err == nil && cookie.Value != "" {
		// Revoked, not rotated: replaying this token later is not a theft signal
		if err := cfg.Db.RevokeRefreshToken(r.Context(), database.RevokeRefreshTokenParams{
			TokenHash: hashToken(cookie.Value),
			Now:       sql.NullTime{Time: cfg.now(), Valid: true},
		}); err != nil {
			utils.RespondError(w, http.StatusInternalServerError, "Could not log out", err)
			return
		}
	}
	cfg.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// respondToFailedRefresh runs when a refresh token was not accepted. A token that
// was already exchanged for a new one has leaked (the thief and the owner both
// hold it), so every session of that user is ended. Tokens that simply expired,
// or were revoked by logout, are not a sign of theft.
func (cfg *ApiConfig) respondToFailedRefresh(ctx context.Context, hash []byte) {
	stored, err := cfg.Db.GetRefreshToken(ctx, hash)
	if err != nil || !stored.RotatedAt.Valid {
		return
	}
	if err := cfg.Db.RevokeUserRefreshTokens(ctx, database.RevokeUserRefreshTokensParams{
		UserID: stored.UserID,
		Now:    sql.NullTime{Time: cfg.now(), Valid: true},
	}); err != nil {
		log.Printf("error: revoking sessions of user %d after token reuse: %s", stored.UserID, err)
	}
}
