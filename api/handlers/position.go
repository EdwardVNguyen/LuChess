package handler

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/EdwardVNguyen/LuChess/api/internal/database"
	"github.com/EdwardVNguyen/LuChess/api/utils"
)

// The 409 answer to a reset that would delete Moves or writing: how many of each.
type resetConflict struct {
	Error    string `json:"error"`
	Moves    int64  `json:"moves"`
	Comments int64  `json:"comments"`
	Bodies   int64  `json:"bodies"`
	Glyphs   int64  `json:"glyphs"`
	Drawings int64  `json:"drawings"`
}

// HandleResetPosition resets a Note to a new Position (ADR 0010). Every Move
// depends on the Position, so this is a new start: every Move goes, and all
// the writing (the Position's own too) with the Links in it, and the PGN tags.
// The name, the Folder and the id stay, so Links to the Note keep working. If
// any Moves or writing would go, it needs ?confirm=true, or it answers 409
// with the counts and changes nothing. A null startFen is the standard start.
func (cfg *ApiConfig) HandleResetPosition(w http.ResponseWriter, r *http.Request) {
	const failure = "Could not change the position"
	confirm := r.URL.Query().Get("confirm") == "true"
	var p struct {
		StartFEN *string `json:"startFen"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	startFEN := sql.NullString{}
	if p.StartFEN != nil {
		startFEN = sql.NullString{String: strings.TrimSpace(*p.StartFEN), Valid: true}
		if err := validateFEN(startFEN.String); err != nil {
			utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
	}

	id, tx, q, ok := cfg.lockedNote(w, r, failure)
	if !ok {
		return
	}
	defer tx.Rollback()
	ctx := r.Context()

	root, err := q.GetRoot(ctx, id)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	moves, err := q.CountMoves(ctx, id)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	writing, err := q.CountSubtreeWriting(ctx, root.ID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if moves+writing.Comments+writing.Bodies+writing.Glyphs+writing.Drawings > 0 && !confirm {
		counts := append([]count{{moves, "Move", "Moves"}}, writingCounts(writing)...)
		utils.RespondJSON(w, http.StatusConflict, resetConflict{
			Error:    "This will delete " + describeCounts(counts),
			Moves:    moves,
			Comments: writing.Comments,
			Bodies:   writing.Bodies,
			Glyphs:   writing.Glyphs,
			Drawings: writing.Drawings,
		})
		return
	}

	now := cfg.now()
	if err := q.DeleteTree(ctx, id); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if _, err := q.AddRoot(ctx, database.AddRootParams{NoteID: id, Now: now}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	note, err := q.ResetNotePosition(ctx, database.ResetNotePositionParams{StartFen: startFEN, Now: now, ID: id})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, toNoteResponse(note))
}
