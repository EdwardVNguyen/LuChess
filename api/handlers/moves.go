package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

// A Note's tree of Moves (ADR 0009). The server does not know chess: edits
// arrive as small operations (add a Move by SAN under a parent, write on a
// Move, delete a subtree, promote), and it trusts the SAN. It keeps one child
// per SAN under a parent, so replaying a Move reuses it.

const (
	// Comments and Bodies have no length limit in the domain; this only stops abuse.
	maxWritingTextLen = 20_000
	// Far beyond any annotated game; a Note holds at most this many Moves.
	maxMoves = 5_000
	// A position rarely needs more than a few dozen; this only stops abuse.
	maxDrawings     = 100
	maxSANLen       = 10
	maxWritingBytes = 2*maxWritingTextLen*4 + 16*1024
)

var (
	moveGlyphs     = []string{"!!", "!", "!?", "?!", "?", "??"}
	positionGlyphs = []string{"+−", "±", "⩲", "=", "∞", "⩱", "∓", "−+"}
	brushes        = []string{"green", "red", "blue", "yellow"}
	// The shape of a SAN, not whether the move is legal: that is the client's.
	sanShape = regexp.MustCompile(`^[a-hKQRBNOx1-8=+#-]+$`)
	square   = regexp.MustCompile(`^[a-h][1-8]$`)
)

// An arrow, or a circle when To is absent, on a Move or the Position.
type drawing struct {
	From  string  `json:"from"`
	To    *string `json:"to,omitempty"`
	Brush string  `json:"brush"`
}

// A Move, or the root (the Position) when ParentID and SAN are nil, with its
// writing. A field of writing is nil when the Move has none of it.
type moveResponse struct {
	ID            int64           `json:"id"`
	ParentID      *int64          `json:"parentId"`
	SAN           *string         `json:"san"`
	Comment       *string         `json:"comment"`
	Body          *string         `json:"body"`
	MoveGlyph     *string         `json:"moveGlyph"`
	PositionGlyph *string         `json:"positionGlyph"`
	Drawings      json.RawMessage `json:"drawings"`
	UpdatedAt     time.Time       `json:"updatedAt"`
}

func toMoveResponse(m database.Move) moveResponse {
	drawings := m.Drawings
	if len(drawings) == 0 {
		drawings = json.RawMessage("[]")
	}
	return moveResponse{
		ID:            m.ID,
		ParentID:      nullableID(m.ParentID),
		SAN:           nullable(m.San),
		Comment:       nullable(m.Comment),
		Body:          nullable(m.Body),
		MoveGlyph:     nullable(m.MoveGlyph),
		PositionGlyph: nullable(m.PositionGlyph),
		Drawings:      drawings,
		UpdatedAt:     m.UpdatedAt,
	}
}

// The writing on a Move as sent: a missing, null or blank field clears it.
type writingInput struct {
	Comment       *string   `json:"comment"`
	Body          *string   `json:"body"`
	MoveGlyph     *string   `json:"moveGlyph"`
	PositionGlyph *string   `json:"positionGlyph"`
	Drawings      []drawing `json:"drawings"`
}

// The writing on a Move as stored.
type writing struct {
	comment, body, moveGlyph, positionGlyph sql.NullString
	drawings                                json.RawMessage
}

// validate trims and checks the writing for a Move, or for the Position when atRoot.
func (in writingInput) validate(atRoot bool) (writing, error) {
	w := writing{
		comment:       trimmedText(in.Comment),
		body:          trimmedText(in.Body),
		moveGlyph:     trimmedText(in.MoveGlyph),
		positionGlyph: trimmedText(in.PositionGlyph),
	}
	errs := []error{
		validateWritingText("Comment", w.comment),
		validateWritingText("Body", w.body),
		validateGlyph("move", w.moveGlyph, moveGlyphs),
		validateGlyph("position", w.positionGlyph, positionGlyphs),
		validateDrawings(in.Drawings),
	}
	if atRoot && w.moveGlyph.Valid {
		errs = append(errs, errors.New("The Position cannot have a move Glyph"))
	}
	if err := firstError(errs); err != nil {
		return writing{}, err
	}
	drawings := in.Drawings
	if drawings == nil {
		drawings = []drawing{}
	}
	w.drawings, _ = json.Marshal(drawings)
	return w, nil
}

func firstError(errs []error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

// trimmedText trims a field; nil or blank becomes NULL.
func trimmedText(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	t := strings.TrimSpace(*s)
	return sql.NullString{String: t, Valid: t != ""}
}

func validateWritingText(field string, s sql.NullString) error {
	if !s.Valid {
		return nil
	}
	if !utf8.ValidString(s.String) {
		return fmt.Errorf("%s must be valid UTF-8", field)
	}
	if utf8.RuneCountInString(s.String) > maxWritingTextLen {
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

func validateDrawings(drawings []drawing) error {
	if len(drawings) > maxDrawings {
		return fmt.Errorf("A move can have at most %d Drawings", maxDrawings)
	}
	// One Drawing per square, or pair of squares: drawing it again removes it (#77).
	seen := make(map[string]bool, len(drawings))
	for _, d := range drawings {
		if !square.MatchString(d.From) || (d.To != nil && !square.MatchString(*d.To)) {
			return errors.New("A Drawing must go from a square to a square, such as e2 to e4")
		}
		if d.To != nil && *d.To == d.From {
			return errors.New("An arrow must point at another square")
		}
		if !slices.Contains(brushes, d.Brush) {
			return fmt.Errorf("A Drawing's brush must be one of %s", strings.Join(brushes, ", "))
		}
		key := d.From
		if d.To != nil {
			key += *d.To
		}
		if seen[key] {
			return errors.New("A move can have each Drawing only once")
		}
		seen[key] = true
	}
	return nil
}

func validateSAN(san string) error {
	if san == "" || len(san) > maxSANLen || !sanShape.MatchString(san) {
		return errors.New("SAN must be a move in Standard Algebraic Notation, such as Nf3")
	}
	return nil
}

func hasWriting(w writing) bool {
	return w.comment.Valid || w.body.Valid || w.moveGlyph.Valid || w.positionGlyph.Valid || string(w.drawings) != "[]"
}

var errTooManyMoves = fmt.Errorf("A note can hold at most %s moves", "5,000")

// HandleListMoves answers a Note's tree: the root (the Position) first, then
// every Move with its siblings in order, each with its writing.
func (cfg *ApiConfig) HandleListMoves(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return
	}
	rows, err := cfg.Db.ListMoves(r.Context(), database.ListMovesParams{NoteID: id, UserID: user.ID})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not load the note's moves", err)
		return
	}
	// Every Note has a root, so no rows means no Note of the user's.
	if len(rows) == 0 {
		noteNotFound(w)
		return
	}
	moves := make([]moveResponse, 0, len(rows))
	for _, m := range rows {
		moves = append(moves, toMoveResponse(m))
	}
	utils.RespondJSON(w, http.StatusOK, moves)
}

// lockedNote opens a transaction holding the user's Note, so edits to its
// tree are serialized. It answers the request itself when it returns false.
func (cfg *ApiConfig) lockedNote(w http.ResponseWriter, r *http.Request, failure string) (int64, *sql.Tx, *database.Queries, bool) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return 0, nil, nil, false
	}
	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return 0, nil, nil, false
	}
	q := cfg.Db.WithTx(tx)
	if _, err := q.LockNote(r.Context(), database.LockNoteParams{ID: id, UserID: user.ID}); errors.Is(err, sql.ErrNoRows) {
		tx.Rollback()
		noteNotFound(w)
		return 0, nil, nil, false
	} else if err != nil {
		tx.Rollback()
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return 0, nil, nil, false
	}
	return id, tx, q, true
}

// moveInNote reads a Move ID from the path and finds it in the locked Note.
// A malformed or missing ID is answered as not found.
func moveInNote(w http.ResponseWriter, r *http.Request, q *database.Queries, noteID int64, failure string) (database.Move, bool) {
	id, err := strconv.ParseInt(r.PathValue("move"), 10, 64)
	if err != nil || id <= 0 {
		moveNotFound(w)
		return database.Move{}, false
	}
	m, err := q.GetMove(r.Context(), database.GetMoveParams{ID: id, NoteID: noteID})
	if errors.Is(err, sql.ErrNoRows) {
		moveNotFound(w)
		return database.Move{}, false
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return database.Move{}, false
	}
	return m, true
}

func moveNotFound(w http.ResponseWriter) {
	utils.RespondError(w, http.StatusNotFound, "Move not found", nil)
}

// HandleAddMove adds a Move by SAN under a parent (a Move or the root) as its
// last child: the next Move of a line that ends there, or the start of a new
// Variation. If the parent already has a child with that SAN, that Move is
// answered instead, with 200 and not 201.
func (cfg *ApiConfig) HandleAddMove(w http.ResponseWriter, r *http.Request) {
	const failure = "Could not save the move"
	var p struct {
		ParentID *int64 `json:"parentId"`
		SAN      string `json:"san"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	san := strings.TrimSpace(p.SAN)
	if err := validateSAN(san); err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	if p.ParentID == nil {
		utils.RespondError(w, http.StatusBadRequest, "A move needs the ID of the move or position it follows", nil)
		return
	}

	id, tx, q, ok := cfg.lockedNote(w, r, failure)
	if !ok {
		return
	}
	defer tx.Rollback()
	ctx := r.Context()

	if _, err := q.GetMove(ctx, database.GetMoveParams{ID: *p.ParentID, NoteID: id}); errors.Is(err, sql.ErrNoRows) {
		moveNotFound(w)
		return
	} else if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	parent := sql.NullInt64{Int64: *p.ParentID, Valid: true}
	existing, err := q.GetChildBySAN(ctx, database.GetChildBySANParams{ParentID: parent, San: sql.NullString{String: san, Valid: true}})
	if err == nil {
		utils.RespondJSON(w, http.StatusOK, toMoveResponse(existing))
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	n, err := q.CountMoves(ctx, id)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if n >= maxMoves {
		utils.RespondError(w, http.StatusBadRequest, errTooManyMoves.Error(), nil)
		return
	}
	added, err := q.AddMove(ctx, database.AddMoveParams{NoteID: id, ParentID: parent, San: sql.NullString{String: san, Valid: true}, Now: cfg.now()})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := q.TouchNote(ctx, database.TouchNoteParams{ID: id, Now: cfg.now()}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	utils.RespondJSON(w, http.StatusCreated, toMoveResponse(added))
}

// HandlePutWriting replaces all the writing on a Move or the Position: its
// Comment, Body, Glyphs and Drawings. A missing, null or blank field clears
// it, so sending nothing deletes the writing. The Links in the Comment and
// Body are indexed with it.
func (cfg *ApiConfig) HandlePutWriting(w http.ResponseWriter, r *http.Request) {
	const failure = "Could not save the writing"
	user := userFrom(r.Context())
	var in writingInput
	if !utils.DecodeJSONLimit(w, r, &in, maxWritingBytes) {
		return
	}

	id, tx, q, ok := cfg.lockedNote(w, r, failure)
	if !ok {
		return
	}
	defer tx.Rollback()
	ctx := r.Context()

	m, ok := moveInNote(w, r, q, id, failure)
	if !ok {
		return
	}
	wr, err := in.validate(!m.ParentID.Valid)
	if err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	saved, err := q.UpdateMoveWriting(ctx, database.UpdateMoveWritingParams{
		Comment: wr.comment, Body: wr.body, MoveGlyph: wr.moveGlyph, PositionGlyph: wr.positionGlyph,
		Drawings: wr.drawings, Now: cfg.now(), ID: m.ID, NoteID: id,
	})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := indexMoveLinks(ctx, q, user.ID, m.ID, wr.comment, wr.body); errors.Is(err, errForeignLinkTarget) {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	} else if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := q.TouchNote(ctx, database.TouchNoteParams{ID: id, Now: cfg.now()}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, toMoveResponse(saved))
}

// The 409 answer to a delete that would delete writing: how many of each.
type deleteConflict struct {
	Error    string `json:"error"`
	Comments int64  `json:"comments"`
	Bodies   int64  `json:"bodies"`
	Glyphs   int64  `json:"glyphs"`
	Drawings int64  `json:"drawings"`
}

// HandleDeleteMove deletes a Move and its whole subtree, with every Variation
// in it. If that would delete any Comments, Bodies, Glyphs or Drawings (and
// the Links in them), it needs ?confirm=true, or it answers 409 with the
// counts and changes nothing. A subtree with no writing goes without asking.
func (cfg *ApiConfig) HandleDeleteMove(w http.ResponseWriter, r *http.Request) {
	const failure = "Could not delete the move"
	confirm := r.URL.Query().Get("confirm") == "true"

	id, tx, q, ok := cfg.lockedNote(w, r, failure)
	if !ok {
		return
	}
	defer tx.Rollback()
	ctx := r.Context()

	m, ok := moveInNote(w, r, q, id, failure)
	if !ok {
		return
	}
	if !m.ParentID.Valid {
		utils.RespondError(w, http.StatusBadRequest, "The Position cannot be deleted", nil)
		return
	}
	counts, err := q.CountSubtreeWriting(ctx, m.ID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if counts.Comments+counts.Bodies+counts.Glyphs+counts.Drawings > 0 && !confirm {
		utils.RespondJSON(w, http.StatusConflict, deleteConflict{
			Error:    "This will delete " + describeWriting(counts),
			Comments: counts.Comments,
			Bodies:   counts.Bodies,
			Glyphs:   counts.Glyphs,
			Drawings: counts.Drawings,
		})
		return
	}
	if _, err := q.DeleteMove(ctx, database.DeleteMoveParams{ID: m.ID, NoteID: id}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := q.TouchNote(ctx, database.TouchNoteParams{ID: id, Now: cfg.now()}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// A number of things of one kind, named in the singular and the plural.
type count struct {
	n         int64
	one, many string
}

func writingCounts(c database.CountSubtreeWritingRow) []count {
	return []count{
		{c.Comments, "Comment", "Comments"},
		{c.Bodies, "Body", "Bodies"},
		{c.Glyphs, "Glyph", "Glyphs"},
		{c.Drawings, "Drawing", "Drawings"},
	}
}

// "2 Comments, 1 Body and 3 Glyphs", leaving out what there is none of.
func describeWriting(c database.CountSubtreeWritingRow) string {
	return describeCounts(writingCounts(c))
}

func describeCounts(counts []count) string {
	var parts []string
	for _, k := range counts {
		if k.n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", k.n, plural(k.n, k.one, k.many)))
		}
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
}

func plural(n int64, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// HandlePromoteMove puts a Move on the Main line: it and every one of its
// ancestors becomes its parent's first child, so each line it branched from
// continues through it, and the old continuations become Variations. Writing
// stays on its Moves.
func (cfg *ApiConfig) HandlePromoteMove(w http.ResponseWriter, r *http.Request) {
	const failure = "Could not promote the move"
	id, tx, q, ok := cfg.lockedNote(w, r, failure)
	if !ok {
		return
	}
	defer tx.Rollback()
	ctx := r.Context()

	m, ok := moveInNote(w, r, q, id, failure)
	if !ok {
		return
	}
	if err := q.PromoteMove(ctx, m.ID); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := q.TouchNote(ctx, database.TouchNoteParams{ID: id, Now: cfg.now()}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// A Move in an imported tree. Parent is the index of an earlier Move in the
// list, or nil for a Move played from the Position; siblings keep the order
// they are listed in, so the first continues the line.
type importedMove struct {
	Parent *int   `json:"parent"`
	SAN    string `json:"san"`
	writingInput
}

// One row of an imported tree, as InsertMoves reads it.
type moveRow struct {
	ID            int64           `json:"id"`
	ParentID      *int64          `json:"parent_id"`
	Ord           int             `json:"ord"`
	SAN           *string         `json:"san"`
	Comment       *string         `json:"comment"`
	Body          *string         `json:"body"`
	MoveGlyph     *string         `json:"move_glyph"`
	PositionGlyph *string         `json:"position_glyph"`
	Drawings      json.RawMessage `json:"drawings"`
}

type linkRow struct {
	MoveID   int64  `json:"move_id"`
	Part     string `json:"part"`
	TargetID int64  `json:"target_id"`
}

// importTree checks an imported tree (the writing on the Position and the
// Moves after it) and inserts it under a new Note, with its Links. Run it in
// the transaction that creates the Note. A validation error is errBadImport.
func importTree(ctx context.Context, q *database.Queries, userID int32, noteID int64, now time.Time, position writingInput, moves []importedMove) error {
	if len(moves) > maxMoves {
		return badImport(errTooManyMoves)
	}
	ids, err := q.NextMoveIDs(ctx, int32(len(moves)+1))
	if err != nil {
		return err
	}
	rows := make([]moveRow, 0, len(moves)+1)
	var links []linkRow
	seen := make(map[[2]any]bool, len(moves))
	nextOrd := make(map[int64]int, len(moves)+1)

	add := func(i int, parent *int64, san *string, in writingInput) error {
		wr, err := in.validate(parent == nil)
		if err != nil {
			return err
		}
		id := ids[i]
		row := moveRow{
			ID: id, ParentID: parent, SAN: san, Drawings: wr.drawings,
			Comment: nullable(wr.comment), Body: nullable(wr.body),
			MoveGlyph: nullable(wr.moveGlyph), PositionGlyph: nullable(wr.positionGlyph),
		}
		if parent != nil {
			row.Ord = nextOrd[*parent]
			nextOrd[*parent]++
		}
		rows = append(rows, row)
		for part, text := range map[string]sql.NullString{"comment": wr.comment, "body": wr.body} {
			for _, target := range linkTargets(text.String) {
				links = append(links, linkRow{MoveID: id, Part: part, TargetID: target})
			}
		}
		return nil
	}

	if err := add(0, nil, nil, position); err != nil {
		return badImport(err)
	}
	for i, m := range moves {
		parent := ids[0]
		if m.Parent != nil {
			if *m.Parent < 0 || *m.Parent >= i {
				return badImport(fmt.Errorf("Move %d must follow the Position or an earlier move", i))
			}
			parent = ids[*m.Parent+1]
		}
		san := strings.TrimSpace(m.SAN)
		if err := validateSAN(san); err != nil {
			return badImport(err)
		}
		key := [2]any{parent, san}
		if seen[key] {
			return badImport(fmt.Errorf("Move %d repeats a move already played from the same position", i))
		}
		seen[key] = true
		if err := add(i+1, &parent, &san, m.writingInput); err != nil {
			return badImport(err)
		}
	}

	if len(links) > 0 {
		var targets []int64
		for _, l := range links {
			targets = append(targets, l.TargetID)
		}
		owned, err := q.ListOwnedNoteIDs(ctx, database.ListOwnedNoteIDsParams{UserID: userID, Ids: targets})
		if err != nil {
			return err
		}
		for _, t := range targets {
			// A new Note cannot be linked from its own writing, since nobody knew its ID.
			if !slices.Contains(owned, t) {
				return badImport(errForeignLinkTarget)
			}
		}
	}

	data, err := json.Marshal(rows)
	if err != nil {
		return err
	}
	if err := q.InsertMoves(ctx, database.InsertMovesParams{NoteID: noteID, Now: now, Rows: data}); err != nil {
		return err
	}
	if len(links) == 0 {
		return nil
	}
	data, err = json.Marshal(links)
	if err != nil {
		return err
	}
	return q.InsertLinks(ctx, data)
}

type errBadImport struct{ err error }

func (e errBadImport) Error() string { return e.err.Error() }

func badImport(err error) error { return errBadImport{err} }
