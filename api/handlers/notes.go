package handler

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

const (
	maxNoteNameLen = 200
	// A long annotated game is a few kilobytes; this leaves plenty of room
	maxPGNBytes      = 64 * 1024
	maxFENBytes      = 100
	maxNoteBodyBytes = maxPGNBytes + 16*1024
	maxSearchLen     = 100
	maxSearchResults = 20
)

type noteSummary struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	// Nil when the Note is at the root, in no Folder
	FolderID  *int64    `json:"folderId"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type noteResponse struct {
	noteSummary
	PGN string `json:"pgn"`
	// Nil for the standard start
	StartFEN *string `json:"startFen"`
}

func toNoteResponse(n database.Note) noteResponse {
	resp := noteResponse{
		noteSummary: noteSummary{ID: n.ID, Name: n.Name, FolderID: nullableID(n.FolderID), CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt},
		PGN:         n.Pgn,
	}
	if n.StartFen.Valid {
		resp.StartFEN = &n.StartFen.String
	}
	return resp
}

func (cfg *ApiConfig) HandleListNotes(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	rows, err := cfg.Db.ListNotes(r.Context(), user.ID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not load notes", err)
		return
	}
	notes := make([]noteSummary, 0, len(rows))
	for _, n := range rows {
		notes = append(notes, noteSummary{ID: n.ID, Name: n.Name, FolderID: nullableID(n.FolderID), CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt})
	}
	utils.RespondJSON(w, http.StatusOK, notes)
}

// A search result: enough to tell same-named Notes apart. White, Black and
// Date come from the PGN headers and are nil when the PGN lacks them.
// FolderPath names the Folders the Note is filed in, from the root down, and
// is empty at the root.
type noteSearchResult struct {
	ID         int64    `json:"id"`
	Name       string   `json:"name"`
	White      *string  `json:"white"`
	Black      *string  `json:"black"`
	Date       *string  `json:"date"`
	FolderPath []string `json:"folderPath"`
}

func (cfg *ApiConfig) HandleSearchNotes(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if utf8.RuneCountInString(q) > maxSearchLen {
		utils.RespondError(w, http.StatusBadRequest, "Search must be at most 100 characters", nil)
		return
	}
	results := []noteSearchResult{}
	if q == "" {
		utils.RespondJSON(w, http.StatusOK, results)
		return
	}
	rows, err := cfg.Db.SearchNotes(r.Context(), database.SearchNotesParams{
		Pattern:    "%" + likeEscaper.Replace(q) + "%",
		Query:      q,
		UserID:     user.ID,
		MaxResults: maxSearchResults,
	})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not search notes", err)
		return
	}
	for _, n := range rows {
		results = append(results, noteSearchResult{
			ID: n.ID, Name: n.Name, White: nullable(n.White), Black: nullable(n.Black), Date: nullable(n.GameDate),
			FolderPath: append([]string{}, n.FolderPath...),
		})
	}
	utils.RespondJSON(w, http.StatusOK, results)
}

// Escapes LIKE wildcards so a search for "100%" means the text itself.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func nullable(s sql.NullString) *string {
	if !s.Valid {
		return nil
	}
	return &s.String
}

func (cfg *ApiConfig) HandleCreateNote(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	var p struct {
		Name     string  `json:"name"`
		PGN      string  `json:"pgn"`
		StartFEN *string `json:"startFen"`
		// The Folder to file the Note in; the root when absent or null.
		FolderID *int64 `json:"folderId"`
	}
	if !utils.DecodeJSONLimit(w, r, &p, maxNoteBodyBytes) {
		return
	}
	name := strings.TrimSpace(p.Name)
	startFEN := sql.NullString{}
	if p.StartFEN != nil {
		startFEN = sql.NullString{String: strings.TrimSpace(*p.StartFEN), Valid: true}
	}
	folder := sql.NullInt64{}
	if p.FolderID != nil {
		folder = sql.NullInt64{Int64: *p.FolderID, Valid: true}
	}
	errs := []error{validateNoteName(name), validatePGN(p.PGN)}
	if startFEN.Valid {
		errs = append(errs, validateFEN(startFEN.String))
	}
	for _, err := range errs {
		if err != nil {
			utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
	}

	note, err := cfg.Db.CreateNote(r.Context(), database.CreateNoteParams{
		UserID:   user.ID,
		Name:     name,
		Pgn:      p.PGN,
		StartFen: startFEN,
		FolderID: folder,
		Now:      cfg.now(),
	})
	// The Folder must be one of the user's; the foreign key checks that.
	if isForeignKeyViolation(err) {
		folderNotFound(w)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create note", err)
		return
	}
	utils.RespondJSON(w, http.StatusCreated, toNoteResponse(note))
}

func (cfg *ApiConfig) HandleGetNote(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return
	}
	note, err := cfg.Db.GetNote(r.Context(), database.GetNoteParams{ID: id, UserID: user.ID})
	if errors.Is(err, sql.ErrNoRows) {
		noteNotFound(w)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not load note", err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, toNoteResponse(note))
}

func (cfg *ApiConfig) HandleRenameNote(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return
	}
	var p struct {
		Name string `json:"name"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	name := strings.TrimSpace(p.Name)
	if err := validateNoteName(name); err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	note, err := cfg.Db.RenameNote(r.Context(), database.RenameNoteParams{
		Name: name, Now: cfg.now(), ID: id, UserID: user.ID,
	})
	if errors.Is(err, sql.ErrNoRows) {
		noteNotFound(w)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not rename note", err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, toNoteResponse(note))
}

func (cfg *ApiConfig) HandleDeleteNote(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return
	}
	n, err := cfg.Db.DeleteNote(r.Context(), database.DeleteNoteParams{ID: id, UserID: user.ID})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete note", err)
		return
	}
	if n == 0 {
		noteNotFound(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// noteID reads the Note ID from the path. A malformed ID is answered like a
// missing Note, since no Note can have it.
func noteID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		noteNotFound(w)
		return 0, false
	}
	return id, true
}

// Another user's Note answers the same as one that does not exist, so IDs reveal nothing.
func noteNotFound(w http.ResponseWriter) {
	utils.RespondError(w, http.StatusNotFound, "Note not found", nil)
}

func validateNoteName(name string) error {
	n := utf8.RuneCountInString(name)
	if n < 1 || n > maxNoteNameLen || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return errors.New("Name must be 1 to 200 characters with no control characters")
	}
	return nil
}

// validatePGN checks only size and encoding; the client parses and validates the moves.
func validatePGN(pgn string) error {
	if strings.TrimSpace(pgn) == "" {
		return errors.New("PGN must not be empty")
	}
	if len(pgn) > maxPGNBytes {
		return errors.New("PGN must be at most 64 KB")
	}
	if !utf8.ValidString(pgn) {
		return errors.New("PGN must be valid UTF-8")
	}
	return nil
}

// validateFEN checks only the basic shape: a placement of eight ranks and the
// five fields after it. Whether the position is legal is the client's concern.
func validateFEN(fen string) error {
	bad := errors.New("Starting position is not a valid FEN")
	if len(fen) > maxFENBytes {
		return bad
	}
	fields := strings.Fields(fen)
	if len(fields) != 6 {
		return bad
	}
	ranks := strings.Split(fields[0], "/")
	if len(ranks) != 8 {
		return bad
	}
	for _, rank := range ranks {
		squares := 0
		for _, c := range rank {
			switch {
			case c >= '1' && c <= '8':
				squares += int(c - '0')
			case strings.ContainsRune("pnbrqkPNBRQK", c):
				squares++
			default:
				return bad
			}
		}
		if squares != 8 {
			return bad
		}
	}
	if fields[1] != "w" && fields[1] != "b" {
		return bad
	}
	if fields[2] != "-" && strings.Trim(fields[2], "KQkq") != "" {
		return bad
	}
	if fields[3] != "-" && (len(fields[3]) != 2 || fields[3][0] < 'a' || fields[3][0] > 'h' || (fields[3][1] != '3' && fields[3][1] != '6')) {
		return bad
	}
	for _, f := range fields[4:] {
		if n, err := strconv.Atoi(f); err != nil || n < 0 {
			return bad
		}
	}
	return nil
}
