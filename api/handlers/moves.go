package handler

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

// The 409 answer to an edit that would delete writing: Plies counts the Plies
// whose Glyphs, Comments or Bodies would go.
type movesConflict struct {
	Error string `json:"error"`
	Plies int64  `json:"plies"`
}

// HandleEditMoves replaces a Note's moves (ADR 0003). The client parses the
// PGN and reports the first Ply that changed; every Glyph, Comment and Body at
// or after it is deleted with the Links it contains. If that would delete
// anything, the edit needs "confirm": true, or it answers 409 with the count
// and changes nothing.
func (cfg *ApiConfig) HandleEditMoves(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return
	}
	var p struct {
		PGN             string `json:"pgn"`
		FirstChangedPly *int   `json:"firstChangedPly"`
		Confirm         bool   `json:"confirm"`
	}
	if !utils.DecodeJSONLimit(w, r, &p, maxNoteBodyBytes) {
		return
	}
	if err := validatePGN(p.PGN); err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	// Ply 0 is the Position, which editing the moves never changes.
	if p.FirstChangedPly == nil || *p.FirstChangedPly < 1 || *p.FirstChangedPly > maxPly {
		utils.RespondError(w, http.StatusBadRequest, fmt.Sprintf("The first changed Ply must be a whole number from 1 to %d", maxPly), nil)
		return
	}
	from := int32(*p.FirstChangedPly)

	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the moves", err)
		return
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	if _, err := q.LockNote(r.Context(), database.LockNoteParams{ID: id, UserID: user.ID}); errors.Is(err, sql.ErrNoRows) {
		noteNotFound(w)
		return
	} else if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the moves", err)
		return
	}
	n, err := q.CountPliesFrom(r.Context(), database.CountPliesFromParams{NoteID: id, Ply: from})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the moves", err)
		return
	}
	if n > 0 && !p.Confirm {
		utils.RespondJSON(w, http.StatusConflict, movesConflict{
			Error: fmt.Sprintf("This will delete your writing on %d %s", n, plural(n, "move", "moves")),
			Plies: n,
		})
		return
	}
	if err := q.DeletePliesFrom(r.Context(), database.DeletePliesFromParams{NoteID: id, Ply: from}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the moves", err)
		return
	}
	note, err := q.ReplaceNoteMoves(r.Context(), database.ReplaceNoteMovesParams{
		Pgn: p.PGN, Now: cfg.now(), ID: id, UserID: user.ID,
	})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the moves", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the moves", err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, toNoteResponse(note))
}

func plural(n int64, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
