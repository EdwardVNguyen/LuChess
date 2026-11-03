package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/session"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

const (
	refreshCookieName = "refresh_token"
	// The cookie is only ever sent to the auth endpoints, never with other requests
	refreshCookiePath = "/api/auth"
)

// sessionHTTP carries the Session module over HTTP: the refresh cookie, the
// Origin guard, the response shape and the auth middleware. The rules of a
// Session (tokens, rotation, reuse) live in the module, not here.
type sessionHTTP struct {
	cfg      *ApiConfig
	sessions *session.Service
}

type userContextKey struct{}

// userFrom returns the user RequireAuth attached to the request.
func userFrom(ctx context.Context) database.User {
	return ctx.Value(userContextKey{}).(database.User)
}

type sessionResponse struct {
	AccessToken string     `json:"accessToken"`
	User        publicUser `json:"user"`
}

func (h *sessionHTTP) refreshCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     refreshCookieName,
		Value:    value,
		Path:     refreshCookiePath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
}

func (h *sessionHTTP) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, h.refreshCookie(token, int(session.RefreshTokenTTL.Seconds())))
}

func (h *sessionHTTP) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, h.refreshCookie("", -1))
}

// requestRefreshToken is the refresh token the request's cookie carries, or "".
func requestRefreshToken(r *http.Request) string {
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

// respond answers with the user and a started or refreshed Session.
func (h *sessionHTTP) respond(w http.ResponseWriter, user database.User, tokens session.Tokens) {
	h.setRefreshCookie(w, tokens.Refresh)
	w.Header().Set("Cache-Control", "no-store")
	utils.RespondJSON(w, http.StatusOK, sessionResponse{
		AccessToken: tokens.Access,
		User:        publicUser{ID: user.ID, Email: user.Email, Name: user.Name},
	})
}

// requireFrontendOrigin is the CSRF guard for endpoints that act on the refresh
// cookie. Browsers always send Origin on a POST, and a forged cross-site request
// carries the attacker's, so anything but our frontend is refused.
func (h *sessionHTTP) requireFrontendOrigin(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("Origin") == h.cfg.FrontendOrigin {
		return true
	}
	utils.RespondError(w, http.StatusForbidden, "Forbidden", nil)
	return false
}

func (h *sessionHTTP) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	if !h.requireFrontendOrigin(w, r) {
		return
	}
	if !h.cfg.allow(w, h.cfg.refreshByIP, clientIP(r)) {
		return
	}

	user, tokens, err := h.sessions.Refresh(r.Context(), requestRefreshToken(r))
	if errors.Is(err, session.ErrEnded) {
		h.clearRefreshCookie(w)
		utils.RespondError(w, http.StatusUnauthorized, "Your session has ended. Please log in again.", nil)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not refresh your session", err)
		return
	}
	h.respond(w, user, tokens)
}

// HandleLogout ends the session whose refresh cookie the request carries. It is
// safe to call repeatedly or without a cookie.
func (h *sessionHTTP) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if !h.requireFrontendOrigin(w, r) {
		return
	}
	if err := h.sessions.End(r.Context(), requestRefreshToken(r)); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not log out", err)
		return
	}
	h.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", "Bearer")
	utils.RespondError(w, http.StatusUnauthorized, "Unauthorized", nil)
}

// RequireAuth only lets requests through that carry a valid access token for a
// user that still exists, and makes that user available through userFrom.
func (h *sessionHTTP) RequireAuth(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		scheme, token, found := strings.Cut(r.Header.Get("Authorization"), " ")
		if !found || !strings.EqualFold(scheme, "Bearer") || token == "" {
			unauthorized(w)
			return
		}

		user, err := h.sessions.Authenticate(r.Context(), token)
		if errors.Is(err, session.ErrUnauthenticated) {
			unauthorized(w)
			return
		}
		if err != nil {
			utils.RespondError(w, http.StatusInternalServerError, "Could not check your session", err)
			return
		}

		next(w, r.WithContext(context.WithValue(r.Context(), userContextKey{}, user)))
	})
}
