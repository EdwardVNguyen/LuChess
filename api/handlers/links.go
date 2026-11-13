package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"slices"
	"strconv"

	"github.com/EdwardVNguyen/LuChess/api/internal/database"
	"github.com/EdwardVNguyen/LuChess/api/utils"
)

// A Link token in a Comment or Body: [[note:42]] or [[note:42|label]] (ADR
// 0002). A label runs to the closing brackets and holds no "]" or line break.
// IDs stop at 15 digits so the browser reads every one exactly; anything else
// is ordinary text. web/src/notes/links.ts reads the same tokens.
var linkToken = regexp.MustCompile(`\[\[note:([1-9][0-9]{0,14})(?:\|([^\]\n]*))?\]\]`)

// linkTargets lists the Notes a text links to, each once, in order of first appearance.
func linkTargets(text string) []int64 {
	var ids []int64
	for _, m := range linkToken.FindAllStringSubmatch(text, -1) {
		id, err := strconv.ParseInt(m[1], 10, 64)
		if err == nil && !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	return ids
}

var errForeignLinkTarget = errors.New("A Link can only point at one of your own notes")

// indexMoveLinks rebuilds the Link index for one Move's saved writing. A
// target must be one of the user's Notes, or already linked from this Move:
// a deleted target stays in the text as an Unresolved Link and must not stop
// the user editing around it. Both failures look the same, so a save reveals
// nothing about other users' Notes. Run it in the transaction that saved the
// writing.
func indexMoveLinks(ctx context.Context, q *database.Queries, userID int32, moveID int64, comment, body sql.NullString) error {
	parts := map[string][]int64{"comment": linkTargets(comment.String), "body": linkTargets(body.String)}
	all := slices.Concat(parts["comment"], parts["body"])

	if len(all) > 0 {
		owned, err := q.ListOwnedNoteIDs(ctx, database.ListOwnedNoteIDsParams{UserID: userID, Ids: all})
		if err != nil {
			return err
		}
		kept, err := q.ListMoveLinkTargets(ctx, moveID)
		if err != nil {
			return err
		}
		for _, id := range all {
			if !slices.Contains(owned, id) && !slices.Contains(kept, id) {
				return errForeignLinkTarget
			}
		}
	}

	if err := q.DeleteMoveLinks(ctx, moveID); err != nil {
		return err
	}
	var rows []linkRow
	for _, part := range []string{"comment", "body"} {
		for _, target := range parts[part] {
			rows = append(rows, linkRow{MoveID: moveID, Part: part, TargetID: target})
		}
	}
	if len(rows) == 0 {
		return nil
	}
	data, err := json.Marshal(rows)
	if err != nil {
		return err
	}
	return q.InsertLinks(ctx, data)
}

// A Note a Link points at, with enough to show and tell apart same-named
// Notes. A Link whose target is missing here is unresolved.
type linkTarget struct {
	ID    int64   `json:"id"`
	Name  string  `json:"name"`
	White *string `json:"white"`
	Black *string `json:"black"`
	Date  *string `json:"date"`
}

// A Comment or Body in another Note that links to this one, on a Move in a
// Main line or a Variation, or on the Position. The SAN, Ply and startFen let
// the client name the Move ("10…exd5") without loading the linking Note.
type backlink struct {
	NoteID   int64   `json:"noteId"`
	Name     string  `json:"name"`
	StartFEN *string `json:"startFen"`
	MoveID   int64   `json:"moveId"`
	SAN      *string `json:"san"`
	Ply      int32   `json:"ply"`
	Part     string  `json:"part"`
}

type noteLinksResponse struct {
	Targets   []linkTarget `json:"targets"`
	Backlinks []backlink   `json:"backlinks"`
}

// HandleNoteLinks answers the Notes this Note links to that still exist, and
// its Backlinks.
func (cfg *ApiConfig) HandleNoteLinks(w http.ResponseWriter, r *http.Request) {
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

	targets, err := cfg.Db.ListLinkTargets(r.Context(), database.ListLinkTargetsParams{NoteID: id, UserID: user.ID})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not load the note's links", err)
		return
	}
	backlinks, err := cfg.Db.ListBacklinks(r.Context(), database.ListBacklinksParams{TargetID: id, UserID: user.ID})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not load the note's links", err)
		return
	}

	resp := noteLinksResponse{Targets: []linkTarget{}, Backlinks: []backlink{}}
	for _, t := range targets {
		resp.Targets = append(resp.Targets, linkTarget{
			ID: t.ID, Name: t.Name, White: nullable(t.White), Black: nullable(t.Black), Date: nullable(t.GameDate),
		})
	}
	for _, b := range backlinks {
		resp.Backlinks = append(resp.Backlinks, backlink{
			NoteID: b.NoteID, Name: b.Name, StartFEN: nullable(b.StartFen),
			MoveID: b.MoveID, SAN: nullable(b.San), Ply: b.Ply, Part: b.Part,
		})
	}
	utils.RespondJSON(w, http.StatusOK, resp)
}
