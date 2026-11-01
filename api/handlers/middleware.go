package handler

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
	"github.com/golang-jwt/jwt/v5"
)

type userContextKey struct{}

// userFrom returns the user RequireAuth attached to the request.
func userFrom(ctx context.Context) database.User {
	return ctx.Value(userContextKey{}).(database.User)
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", "Bearer")
	utils.RespondError(w, http.StatusUnauthorized, "Unauthorized", nil)
}

// RequireAuth only lets requests through that carry a valid access token for a
// user that still exists, and makes that user available through userFrom.
func (cfg *ApiConfig) RequireAuth(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		scheme, token, found := strings.Cut(r.Header.Get("Authorization"), " ")
		if !found || !strings.EqualFold(scheme, "Bearer") || token == "" {
			unauthorized(w)
			return
		}

		claims := &jwt.RegisteredClaims{}
		_, err := jwt.ParseWithClaims(token, claims,
			func(*jwt.Token) (any, error) { return cfg.JWTSecret, nil },
			// Only the algorithm we sign with, so a token cannot choose its own
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
			jwt.WithExpirationRequired(),
			jwt.WithTimeFunc(cfg.now),
		)
		if err != nil {
			unauthorized(w)
			return
		}
		userID, err := strconv.ParseInt(claims.Subject, 10, 32)
		if err != nil {
			unauthorized(w)
			return
		}

		user, err := cfg.Db.GetUserByID(r.Context(), int32(userID))
		if err == sql.ErrNoRows {
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

func (cfg *ApiConfig) HandleMe(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	utils.RespondJSON(w, http.StatusOK, publicUser{ID: user.ID, Email: user.Email, Name: user.Name})
}
