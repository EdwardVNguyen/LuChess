package handler

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/EdwardVNguyen/LuChess/api/internal/password"
	"github.com/EdwardVNguyen/LuChess/api/utils"
)

func (cfg *ApiConfig) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if !cfg.allow(w, cfg.loginByIP, cfg.clientIP(r)) {
		return
	}
	var p struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !utils.DecodeJSON(w, r, &p) {
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

	tokens, err := cfg.Session.Start(r.Context(), user.ID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not log in", err)
		return
	}
	cfg.sessionHTTP.respond(w, user, tokens)
}
