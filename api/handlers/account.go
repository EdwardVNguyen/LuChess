package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/EdwardVNguyen/LuChess/api/internal/database"
	"github.com/EdwardVNguyen/LuChess/api/internal/password"
	"github.com/EdwardVNguyen/LuChess/api/utils"
)

// HandleDeleteAccount permanently deletes the signed-in user once they re-enter
// their password (#12). Every Session is revoked first, then the user and
// everything they own is hard-deleted in the same transaction: Folders, Notes,
// Glyphs, Comments, Bodies, Links, and refresh and email tokens. Links other
// users wrote to the deleted Notes stay, unresolved. There is no grace period.
func (h *sessionHTTP) HandleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	// A stolen access token must not be a way to guess the password
	if !h.cfg.allow(w, h.cfg.deleteByUser, strconv.Itoa(int(user.ID))) {
		return
	}
	var p struct {
		Password string `json:"password"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	if p.Password == "" {
		utils.RespondError(w, http.StatusBadRequest, "Enter your password", nil)
		return
	}
	// 403, not 401: the Session is fine, only the password is wrong
	if ok, err := password.Verify(p.Password, user.PasswordHash); err != nil || !ok {
		utils.RespondError(w, http.StatusForbidden, "That password is not correct", nil)
		return
	}

	tx, err := h.cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete your account", err)
		return
	}
	defer tx.Rollback()
	q := h.cfg.Db.WithTx(tx)

	if err := q.RevokeUserRefreshTokens(r.Context(), database.RevokeUserRefreshTokensParams{
		UserID: user.ID,
		Now:    sql.NullTime{Time: h.cfg.now(), Valid: true},
	}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete your account", err)
		return
	}
	if _, err := q.DeleteUser(r.Context(), user.ID); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete your account", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete your account", err)
		return
	}

	// Access tokens already issued stop working too: RequireAuth only accepts
	// a token whose user still exists.
	h.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}
