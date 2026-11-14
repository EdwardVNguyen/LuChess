package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/EdwardVNguyen/LuChess/api/internal/database"
	"github.com/EdwardVNguyen/LuChess/api/utils"
)

// Applying a PGN to a Note with the same Position (#109, ADR 0010). The client
// reads the PGN into a tree, as for a new Note, and the server matches each of
// its Moves to a stored one by the same line of SANs from the Position: the
// rule that keeps one child per SAN under a parent. Matched Moves keep their
// ids, and their writing where the PGN shows it unchanged; new Moves are added;
// stored Moves the PGN no longer has are deleted with their subtrees; and
// siblings take the PGN's order. The tags are replaced, and the name stays.
// A PGN with a different Position is a reset instead (HandleResetPosition).

// Writing read from a PGN for a Move that may already have some. The PGN shows
// a Link as plain text, so a matched Move keeps its stored Comment or Body,
// Links and all, when the client says the PGN shows it as the export wrote it.
type pgnWriting struct {
	writingInput
	KeepComment bool `json:"keepComment"`
	KeepBody    bool `json:"keepBody"`
}

// A Move of an applied tree, listed as for importedMove.
type appliedMove struct {
	Parent *int   `json:"parent"`
	SAN    string `json:"san"`
	pgnWriting
}

// What applying a tree would delete or replace: Moves, writing by kind, and
// Links whose Comment or Body is replaced, so they become plain text.
type treeLoss struct {
	moves, comments, bodies, glyphs, drawings, links int64
}

func (l treeLoss) any() bool {
	return l.moves+l.comments+l.bodies+l.glyphs+l.drawings+l.links > 0
}

// "This will delete 12 Moves and 2 Comments; 1 Link becomes plain text".
func (l treeLoss) describe() string {
	deleted := describeCounts([]count{
		{l.moves, "Move", "Moves"},
		{l.comments, "Comment", "Comments"},
		{l.bodies, "Body", "Bodies"},
		{l.glyphs, "Glyph", "Glyphs"},
		{l.drawings, "Drawing", "Drawings"},
	})
	var parts []string
	if deleted != "" {
		parts = append(parts, "This will delete "+deleted)
	}
	if l.links > 0 {
		parts = append(parts, fmt.Sprintf("%d %s plain text", l.links, plural(l.links, "Link becomes", "Links become")))
	}
	return strings.Join(parts, "; ")
}

// The 409 answer to an apply that would delete or replace anything.
type treeConflict struct {
	Error    string `json:"error"`
	Moves    int64  `json:"moves"`
	Comments int64  `json:"comments"`
	Bodies   int64  `json:"bodies"`
	Glyphs   int64  `json:"glyphs"`
	Drawings int64  `json:"drawings"`
	Links    int64  `json:"links"`
}

type treeResponse struct {
	Note  noteResponse   `json:"note"`
	Moves []moveResponse `json:"moves"`
}

// The stored writing a Move would lose: all of it.
func (l *treeLoss) deleted(m database.Move) {
	l.comments += countValid(m.Comment)
	l.bodies += countValid(m.Body)
	l.glyphs += countValid(m.MoveGlyph) + countValid(m.PositionGlyph)
	l.drawings += int64(len(parseDrawings(m.Drawings)))
}

// The stored writing a matched Move would lose to its new writing: each part
// that changes or goes, each Drawing not drawn again, and the Links in a
// Comment or Body that is replaced by other text.
func (l *treeLoss) replaced(m database.Move, w writing) {
	for _, part := range []struct {
		stored, next sql.NullString
		n            *int64
	}{{m.Comment, w.comment, &l.comments}, {m.Body, w.body, &l.bodies}} {
		if !part.stored.Valid || part.stored == part.next {
			continue
		}
		*part.n++
		if part.next.Valid {
			next := linkTargets(part.next.String)
			for _, target := range linkTargets(part.stored.String) {
				if !slices.Contains(next, target) {
					l.links++
				}
			}
		}
	}
	for _, glyph := range [][2]sql.NullString{{m.MoveGlyph, w.moveGlyph}, {m.PositionGlyph, w.positionGlyph}} {
		if glyph[0].Valid && glyph[0] != glyph[1] {
			l.glyphs++
		}
	}
	next := parseDrawings(w.drawings)
	for _, d := range parseDrawings(m.Drawings) {
		if !slices.ContainsFunc(next, d.same) {
			l.drawings++
		}
	}
}

func countValid(s sql.NullString) int64 {
	if s.Valid {
		return 1
	}
	return 0
}

// The stored Drawings were validated when saved, so they always parse.
func parseDrawings(raw json.RawMessage) []drawing {
	var drawings []drawing
	_ = json.Unmarshal(raw, &drawings)
	return drawings
}

func (d drawing) same(other drawing) bool {
	return d.From == other.From && d.Brush == other.Brush && (d.To == nil) == (other.To == nil) && (d.To == nil || *d.To == *other.To)
}

// sameDrawings is whether two lists hold the same Drawings, in any order:
// the export writes circles before arrows, whatever order they were drawn in.
func sameDrawings(a, b json.RawMessage) bool {
	x, y := parseDrawings(a), parseDrawings(b)
	if len(x) != len(y) {
		return false
	}
	for _, d := range x {
		if !slices.ContainsFunc(y, d.same) {
			return false
		}
	}
	return true
}

// keptWriting is the writing a matched Move ends with: the PGN's, except the
// Comment or Body the PGN shows unchanged, and the Drawings when the PGN has
// the same ones, which stay as stored.
func keptWriting(m database.Move, in pgnWriting, w writing) writing {
	if in.KeepComment {
		w.comment = m.Comment
	}
	if in.KeepBody {
		w.body = m.Body
	}
	if sameDrawings(m.Drawings, w.drawings) {
		w.drawings = m.Drawings
	}
	return w
}

func writingChanged(m database.Move, w writing) bool {
	return m.Comment != w.comment || m.Body != w.body || m.MoveGlyph != w.moveGlyph ||
		m.PositionGlyph != w.positionGlyph || !sameDrawings(m.Drawings, w.drawings)
}

// A Move of the applied tree once matched: the stored Move it is, or none
// when it is new, and the writing it ends with.
type matchedMove struct {
	stored  *database.Move
	parent  int64 // the stored parent's id; 0 when the parent is new too
	ord     int
	writing writing
}

// HandleApplyTree applies a tree read from a PGN to a Note with the same
// Position, keeping what did not change. If it would delete any Move (even one
// with no writing), or delete or replace any writing, or turn a Link into
// plain text, it needs ?confirm=true, or it answers 409 with the counts and
// changes nothing. Adding Moves, reordering them and changing the tags need no
// confirmation. It answers the Note and its whole tree.
func (cfg *ApiConfig) HandleApplyTree(w http.ResponseWriter, r *http.Request) {
	const failure = "Could not apply the PGN"
	user := userFrom(r.Context())
	confirm := r.URL.Query().Get("confirm") == "true"
	var p struct {
		Tags     [][]string    `json:"tags"`
		Position pgnWriting    `json:"position"`
		Moves    []appliedMove `json:"moves"`
	}
	if !utils.DecodeJSONLimit(w, r, &p, maxNoteBodyBytes) {
		return
	}
	if err := validateTags(p.Tags); err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	if len(p.Moves) > maxMoves {
		utils.RespondError(w, http.StatusBadRequest, errTooManyMoves.Error(), nil)
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

	rows, err := q.ListMoves(ctx, database.ListMovesParams{NoteID: id, UserID: user.ID})
	if err != nil || len(rows) == 0 || rows[0].ParentID.Valid {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	root := rows[0]
	bySAN := make(map[int64]map[string]*database.Move, len(rows))
	for i := range rows[1:] {
		m := &rows[i+1]
		if bySAN[m.ParentID.Int64] == nil {
			bySAN[m.ParentID.Int64] = map[string]*database.Move{}
		}
		bySAN[m.ParentID.Int64][m.San.String] = m
	}

	// Match the tree, checking it as an import is checked.
	rootWriting, err := p.Position.validate(true)
	if err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	rootWriting = keptWriting(root, p.Position, rootWriting)
	moves := make([]matchedMove, len(p.Moves))
	sans := make([]string, len(p.Moves))
	seen := make(map[[2]any]bool, len(p.Moves))
	nextOrd := make(map[int]int, len(p.Moves)+1)
	matched := map[int64]bool{root.ID: true}
	for i, in := range p.Moves {
		parent := -1
		storedParent := root.ID
		if in.Parent != nil {
			if *in.Parent < 0 || *in.Parent >= i {
				utils.RespondError(w, http.StatusBadRequest, fmt.Sprintf("Move %d must follow the Position or an earlier move", i), nil)
				return
			}
			parent = *in.Parent
			storedParent = 0
			if s := moves[parent].stored; s != nil {
				storedParent = s.ID
			}
		}
		san := strings.TrimSpace(in.SAN)
		if err := validateSAN(san); err != nil {
			utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		key := [2]any{parent, san}
		if seen[key] {
			utils.RespondError(w, http.StatusBadRequest, fmt.Sprintf("Move %d repeats a move already played from the same position", i), nil)
			return
		}
		seen[key] = true
		wr, err := in.validate(false)
		if err != nil {
			utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
		m := matchedMove{parent: storedParent, ord: nextOrd[parent], writing: wr}
		nextOrd[parent]++
		if storedParent != 0 {
			if s := bySAN[storedParent][san]; s != nil {
				m.stored = s
				m.writing = keptWriting(*s, in.pgnWriting, wr)
				matched[s.ID] = true
			}
		}
		moves[i] = m
		sans[i] = san
	}

	// What goes: every stored Move left unmatched, and the writing replaced on matched ones.
	var loss treeLoss
	var deleted []int64
	for _, m := range rows[1:] {
		if !matched[m.ID] {
			deleted = append(deleted, m.ID)
			loss.moves++
			loss.deleted(m)
		}
	}
	loss.replaced(root, rootWriting)
	for _, m := range moves {
		if m.stored != nil {
			loss.replaced(*m.stored, m.writing)
		}
	}
	if loss.any() && !confirm {
		utils.RespondJSON(w, http.StatusConflict, treeConflict{
			Error: loss.describe(),
			Moves: loss.moves, Comments: loss.comments, Bodies: loss.bodies,
			Glyphs: loss.glyphs, Drawings: loss.drawings, Links: loss.links,
		})
		return
	}

	now := cfg.now()
	if len(deleted) > 0 {
		if err := q.DeleteMoves(ctx, database.DeleteMovesParams{NoteID: id, Ids: deleted}); err != nil {
			utils.RespondError(w, http.StatusInternalServerError, failure, err)
			return
		}
	}

	// The matched Moves take their places among their siblings, and the new
	// ones are inserted in theirs, with their Links.
	type orderRow struct {
		ID  int64 `json:"id"`
		Ord int   `json:"ord"`
	}
	var orders []orderRow
	var added []int
	for i, m := range moves {
		if m.stored != nil {
			orders = append(orders, orderRow{ID: m.stored.ID, Ord: m.ord})
		} else {
			added = append(added, i)
		}
	}
	if len(orders) > 0 {
		data, _ := json.Marshal(orders)
		if err := q.SetMoveOrders(ctx, database.SetMoveOrdersParams{NoteID: id, Rows: data}); err != nil {
			utils.RespondError(w, http.StatusInternalServerError, failure, err)
			return
		}
	}
	if len(added) > 0 {
		ids, err := q.NextMoveIDs(ctx, int32(len(added)))
		if err != nil {
			utils.RespondError(w, http.StatusInternalServerError, failure, err)
			return
		}
		idOf := make(map[int]int64, len(added))
		newRows := make([]moveRow, 0, len(added))
		var links []linkRow
		for n, i := range added {
			idOf[i] = ids[n]
			m := moves[i]
			parent := m.parent
			if parent == 0 {
				parent = idOf[*p.Moves[i].Parent]
			}
			san := sans[i]
			newRows = append(newRows, moveRow{
				ID: ids[n], ParentID: &parent, Ord: m.ord, SAN: &san, Drawings: m.writing.drawings,
				Comment: nullable(m.writing.comment), Body: nullable(m.writing.body),
				MoveGlyph: nullable(m.writing.moveGlyph), PositionGlyph: nullable(m.writing.positionGlyph),
			})
			for part, text := range map[string]sql.NullString{"comment": m.writing.comment, "body": m.writing.body} {
				for _, target := range linkTargets(text.String) {
					links = append(links, linkRow{MoveID: ids[n], Part: part, TargetID: target})
				}
			}
		}
		if err := insertNewMoves(ctx, q, user.ID, id, now, newRows, links); errors.Is(err, errForeignLinkTarget) {
			utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		} else if err != nil {
			utils.RespondError(w, http.StatusInternalServerError, failure, err)
			return
		}
	}

	// The writing that changed on matched Moves, the Position's included.
	rewrite := func(m database.Move, wr writing) error {
		if !writingChanged(m, wr) {
			return nil
		}
		if _, err := q.UpdateMoveWriting(ctx, database.UpdateMoveWritingParams{
			Comment: wr.comment, Body: wr.body, MoveGlyph: wr.moveGlyph, PositionGlyph: wr.positionGlyph,
			Drawings: wr.drawings, Now: now, ID: m.ID, NoteID: id,
		}); err != nil {
			return err
		}
		return indexMoveLinks(ctx, q, user.ID, m.ID, wr.comment, wr.body)
	}
	err = rewrite(root, rootWriting)
	for _, m := range moves {
		if err == nil && m.stored != nil {
			err = rewrite(*m.stored, m.writing)
		}
	}
	if errors.Is(err, errForeignLinkTarget) {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	} else if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}

	note, err := q.SetNoteTags(ctx, database.SetNoteTagsParams{Tags: tags, Now: now, ID: id})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	tree, err := q.ListMoves(ctx, database.ListMovesParams{NoteID: id, UserID: user.ID})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, failure, err)
		return
	}
	resp := treeResponse{Note: toNoteResponse(note), Moves: make([]moveResponse, 0, len(tree))}
	for _, m := range tree {
		resp.Moves = append(resp.Moves, toMoveResponse(m))
	}
	utils.RespondJSON(w, http.StatusOK, resp)
}
