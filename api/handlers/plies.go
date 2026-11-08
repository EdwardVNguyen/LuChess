package handler

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

const (
	// Comments and Bodies have no length limit in the domain; this only stops abuse.
	maxPlyTextLen = 20_000
	// Far beyond the longest game ever played; the server does not parse the PGN.
	maxPly          = 10_000
	maxPlyBodyBytes = 2*maxPlyTextLen*4 + 4*1024
)

var (
	moveGlyphs     = []string{"!!", "!", "!?", "?!", "?", "??"}
	positionGlyphs = []string{"+−", "±", "⩲", "=", "∞", "⩱", "∓", "−+"}
)

// The writing on one Ply. A field is nil when the Ply has none of it.
type plyResponse struct {
	Ply           int32     `json:"ply"`
	Comment       *string   `json:"comment"`
	Body          *string   `json:"body"`
	MoveGlyph     *string   `json:"moveGlyph"`
	PositionGlyph *string   `json:"positionGlyph"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func toPlyResponse(p database.Ply) plyResponse {
	return plyResponse{
		Ply:           p.Ply,
		Comment:       nullable(p.Comment),
		Body:          nullable(p.Body),
		MoveGlyph:     nullable(p.MoveGlyph),
		PositionGlyph: nullable(p.PositionGlyph),
		UpdatedAt:     p.UpdatedAt,
	}
}

// HandleListPlies answers every Ply of a Note that has writing, in order.
func (cfg *ApiConfig) HandleListPlies(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return
	}
	if _, err := cfg.Db.GetNote(r.Context(), database.GetNoteParams{ID: id, UserID: user.ID}); errors.Is(err, sql.ErrNoRows) {
		noteNotFound(w)
		return
	} else if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not load note", err)
		return
	}
	rows, err := cfg.Db.ListPlies(r.Context(), database.ListPliesParams{NoteID: id, UserID: user.ID})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not load the note's writing", err)
		return
	}
	plies := make([]plyResponse, 0, len(rows))
	for _, p := range rows {
		plies = append(plies, toPlyResponse(p))
	}
	utils.RespondJSON(w, http.StatusOK, plies)
}

// HandlePutPly replaces all the writing on one Ply. A missing, null or blank
// field clears it, so sending nothing deletes the Ply's writing.
func (cfg *ApiConfig) HandlePutPly(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return
	}
	ply, err := strconv.Atoi(r.PathValue("ply"))
	if err != nil || ply < 0 || ply > maxPly {
		utils.RespondError(w, http.StatusBadRequest, fmt.Sprintf("Ply must be a whole number from 0 to %d", maxPly), nil)
		return
	}
	var p struct {
		Comment       *string `json:"comment"`
		Body          *string `json:"body"`
		MoveGlyph     *string `json:"moveGlyph"`
		PositionGlyph *string `json:"positionGlyph"`
	}
	if !utils.DecodeJSONLimit(w, r, &p, maxPlyBodyBytes) {
		return
	}
	comment, body := plyText(p.Comment), plyText(p.Body)
	moveGlyph, positionGlyph := plyText(p.MoveGlyph), plyText(p.PositionGlyph)
	errs := []error{
		validatePlyText("Comment", comment),
		validatePlyText("Body", body),
		validateGlyph("move", moveGlyph, moveGlyphs),
		validateGlyph("position", positionGlyph, positionGlyphs),
	}
	if ply == 0 && moveGlyph.Valid {
		errs = append(errs, errors.New("Ply 0 is the Position, so it cannot have a move Glyph"))
	}
	for _, err := range errs {
		if err != nil {
			utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
	}

	if !comment.Valid && !body.Valid && !moveGlyph.Valid && !positionGlyph.Valid {
		n, err := cfg.Db.ClearPly(r.Context(), database.ClearPlyParams{
			Now: cfg.now(), NoteID: id, UserID: user.ID, Ply: int32(ply),
		})
		if err != nil {
			utils.RespondError(w, http.StatusInternalServerError, "Could not save the writing", err)
			return
		}
		if n == 0 {
			noteNotFound(w)
			return
		}
		utils.RespondJSON(w, http.StatusOK, plyResponse{Ply: int32(ply), UpdatedAt: cfg.now()})
		return
	}

	saved, err := cfg.Db.UpsertPly(r.Context(), database.UpsertPlyParams{
		Ply:           int32(ply),
		Comment:       comment,
		Body:          body,
		MoveGlyph:     moveGlyph,
		PositionGlyph: positionGlyph,
		Now:           cfg.now(),
		NoteID:        id,
		UserID:        user.ID,
	})
	if errors.Is(err, sql.ErrNoRows) {
		noteNotFound(w)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the writing", err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, toPlyResponse(saved))
}

// plyText trims a field; nil or blank becomes NULL.
func plyText(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	t := strings.TrimSpace(*s)
	return sql.NullString{String: t, Valid: t != ""}
}

func validatePlyText(field string, s sql.NullString) error {
	if !s.Valid {
		return nil
	}
	if !utf8.ValidString(s.String) {
		return fmt.Errorf("%s must be valid UTF-8", field)
	}
	if utf8.RuneCountInString(s.String) > maxPlyTextLen {
		return fmt.Errorf("%s must be at most 20,000 characters", field)
	}
	return nil
}

func validateGlyph(kind string, g sql.NullString, allowed []string) error {
	if g.Valid && !slices.Contains(allowed, g.String) {
		return fmt.Errorf("The %s Glyph must be one of %s", kind, strings.Join(allowed, " "))
	}
	return nil
}
