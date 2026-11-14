package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
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
//
// A PGN with a new Position, applied to the Note (#109), resets it the same
// way and brings its own tree and tags, imported as a new Note's are, in the
// same transaction. Without them the Note starts empty, with no tags.
func (cfg *ApiConfig) HandleResetPosition(w http.ResponseWriter, r *http.Request) {
	const failure = "Could not change the position"
	user := userFrom(r.Context())
	confirm := r.URL.Query().Get("confirm") == "true"
	var p struct {
		StartFEN *string        `json:"startFen"`
		Tags     [][]string     `json:"tags"`
		Position writingInput   `json:"position"`
		Moves    []importedMove `json:"moves"`
	}
	if !utils.DecodeJSONLimit(w, r, &p, maxNoteBodyBytes) {
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
	if err := validateTags(p.Tags); err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	if p.Tags == nil {
		p.Tags = [][]string{}
	}
	tags, _ := json.Marshal(p.Tags)

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
	var bad errBadImport
	if err := importTree(ctx, q, user.ID, id, now, p.Position, p.Moves); errors.As(err, &bad) {
		utils.RespondError(w, http.StatusBadRequest, bad.Error(), nil)
		return
	} else if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	note, err := q.ResetNotePosition(ctx, database.ResetNotePositionParams{StartFen: startFEN, Tags: tags, Now: now, ID: id})
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
