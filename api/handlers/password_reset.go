package handler

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/mailer"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

const resetTokenTTL = time.Hour

func (cfg *ApiConfig) HandleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if !cfg.allow(w, cfg.forgotByIP, clientIP(r)) {
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
	if !cfg.allow(w, cfg.forgotByEmail, email) {
		return
	}

	// The answer is the same whether or not the email has an account, so this
	// endpoint cannot be used to find out who is registered.
	respond := func() {
		utils.RespondJSON(w, http.StatusOK, map[string]string{
			"message": "If that email belongs to an account, we have sent a link to reset its password.",
		})
	}

	user, err := cfg.Db.GetUserByEmail(r.Context(), email)
	if errors.Is(err, sql.ErrNoRows) {
		respond()
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not send reset email", err)
		return
	}

	token, tokenHash, err := newToken()
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not send reset email", err)
		return
	}
	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not send reset email", err)
		return
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	// Only the newest link works, so an older email lying around is harmless
	if err := q.DeleteUnusedEmailTokens(r.Context(), database.DeleteUnusedEmailTokensParams{
		UserID:  user.ID,
		Purpose: database.EmailTokenPurposeReset,
	}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not send reset email", err)
		return
	}
	if err := q.CreateEmailToken(r.Context(), database.CreateEmailTokenParams{
		UserID:    user.ID,
		Purpose:   database.EmailTokenPurposeReset,
		TokenHash: tokenHash,
		ExpiresAt: cfg.now().Add(resetTokenTTL),
	}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not send reset email", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not send reset email", err)
		return
	}

	if err := cfg.sendResetEmail(r, user.Email, token); err != nil {
		log.Printf("error: sending reset email to user %d: %s", user.ID, err)
	}
	respond()
}

func (cfg *ApiConfig) HandleResetPassword(w http.ResponseWriter, r *http.Request) {
	var p struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	// Checked before the token is spent, so a rejected password can be retried with the same link
	if err := validatePassword(p.Password); err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	hash, err := cfg.Hasher.Hash(p.Password)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not reset password", err)
		return
	}

	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not reset password", err)
		return
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	now := cfg.now()
	userID, err := q.ConsumeEmailToken(r.Context(), database.ConsumeEmailTokenParams{
		TokenHash: hashToken(p.Token),
		Purpose:   database.EmailTokenPurposeReset,
		Now:       sql.NullTime{Time: now, Valid: true},
	})
	if errors.Is(err, sql.ErrNoRows) {
		utils.RespondError(w, http.StatusBadRequest, "This reset link is invalid or has expired", nil)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not reset password", err)
		return
	}
	if err := q.UpdateUserPassword(r.Context(), database.UpdateUserPasswordParams{
		ID: userID, PasswordHash: hash, Now: now,
	}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not reset password", err)
		return
	}
	// Opening the link proves the user owns the address, as a verification link would
	if err := q.MarkEmailVerified(r.Context(), database.MarkEmailVerifiedParams{ID: userID, Now: now}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not reset password", err)
		return
	}
	// Every Session ends, including any someone else started with the old password (ADR 0004)
	if err := q.RevokeUserRefreshTokens(r.Context(), database.RevokeUserRefreshTokensParams{
		UserID: userID,
		Now:    sql.NullTime{Time: now, Valid: true},
	}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not reset password", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not reset password", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (cfg *ApiConfig) sendResetEmail(r *http.Request, to, token string) error {
	link := fmt.Sprintf("%s/reset-password?token=%s", cfg.FrontendOrigin, token)
	return cfg.Mailer.Send(r.Context(), mailer.Message{
		To:      to,
		Subject: "Reset your ChessNotes password",
		Text: "Someone asked to reset the password for your ChessNotes account.\n\n" +
			"Choose a new password by opening this link within 1 hour:\n\n" + link + "\n\n" +
			"If you did not ask for this, you can ignore this email; your password has not changed.\n",
	})
}
