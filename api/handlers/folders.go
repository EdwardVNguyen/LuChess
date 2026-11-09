package handler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/utils"
	"github.com/lib/pq"
)

// A Folder, as listed: the client builds the tree from the parents. ParentID
// is nil at the root.
type folderResponse struct {
	ID       int64  `json:"id"`
	ParentID *int64 `json:"parentId"`
	Name     string `json:"name"`
}

func toFolderResponse(id int64, parent sql.NullInt64, name string) folderResponse {
	return folderResponse{ID: id, ParentID: nullableID(parent), Name: name}
}

// The 409 answer to deleting a Folder that is not empty: Folders counts its
// subfolders at any depth, which are deleted with it, and Notes the Notes in
// any of them, which move to the root.
type folderConflict struct {
	Error   string `json:"error"`
	Folders int64  `json:"folders"`
	Notes   int64  `json:"notes"`
}

// optionalID is a JSON field that can be absent, null or an ID, so a PATCH
// can tell "leave the parent" from "move to the root".
type optionalID struct {
	Set   bool
	Value sql.NullInt64
}

func (o *optionalID) UnmarshalJSON(data []byte) error {
	o.Set = true
	if bytes.Equal(data, []byte("null")) {
		o.Value = sql.NullInt64{}
		return nil
	}
	var id int64
	if err := json.Unmarshal(data, &id); err != nil {
		return err
	}
	o.Value = sql.NullInt64{Int64: id, Valid: true}
	return nil
}

func (cfg *ApiConfig) HandleListFolders(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	rows, err := cfg.Db.ListFolders(r.Context(), user.ID)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not load folders", err)
		return
	}
	folders := make([]folderResponse, 0, len(rows))
	for _, f := range rows {
		folders = append(folders, toFolderResponse(f.ID, f.ParentID, f.Name))
	}
	utils.RespondJSON(w, http.StatusOK, folders)
}

func (cfg *ApiConfig) HandleCreateFolder(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	var p struct {
		Name     string `json:"name"`
		ParentID *int64 `json:"parentId"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	name := strings.TrimSpace(p.Name)
	if err := validateFolderName(name); err != nil {
		utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}
	parent := sql.NullInt64{}
	if p.ParentID != nil {
		parent = sql.NullInt64{Int64: *p.ParentID, Valid: true}
	}
	folder, err := cfg.Db.CreateFolder(r.Context(), database.CreateFolderParams{
		UserID: user.ID, ParentID: parent, Name: name, Now: cfg.now(),
	})
	// The parent must be one of the user's Folders; the foreign key checks that.
	if isForeignKeyViolation(err) {
		parentFolderNotFound(w)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create folder", err)
		return
	}
	utils.RespondJSON(w, http.StatusCreated, toFolderResponse(folder.ID, folder.ParentID, folder.Name))
}

// HandleUpdateFolder renames a Folder, moves it under another Folder or to the
// root (parentId null), or both. A Folder cannot move into itself or one of
// its own subfolders.
func (cfg *ApiConfig) HandleUpdateFolder(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := folderID(w, r)
	if !ok {
		return
	}
	var p struct {
		Name     *string    `json:"name"`
		ParentID optionalID `json:"parentId"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	if p.Name != nil {
		*p.Name = strings.TrimSpace(*p.Name)
		if err := validateFolderName(*p.Name); err != nil {
			utils.RespondError(w, http.StatusBadRequest, err.Error(), nil)
			return
		}
	}

	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the folder", err)
		return
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	if err := q.LockFolders(r.Context(), user.ID); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the folder", err)
		return
	}
	folder, err := q.GetFolder(r.Context(), database.GetFolderParams{ID: id, UserID: user.ID})
	if errors.Is(err, sql.ErrNoRows) {
		folderNotFound(w)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the folder", err)
		return
	}

	name, parent := folder.Name, folder.ParentID
	if p.Name != nil {
		name = *p.Name
	}
	if p.ParentID.Set {
		parent = p.ParentID.Value
		if parent.Valid {
			inside, err := q.IsInFolderTree(r.Context(), database.IsInFolderTreeParams{
				Root: id, Candidate: parent.Int64, UserID: user.ID,
			})
			if err != nil {
				utils.RespondError(w, http.StatusInternalServerError, "Could not save the folder", err)
				return
			}
			if inside {
				utils.RespondError(w, http.StatusBadRequest, "A folder can't be moved into itself or one of its subfolders", nil)
				return
			}
		}
	}

	updated, err := q.UpdateFolder(r.Context(), database.UpdateFolderParams{
		Name: name, ParentID: parent, Now: cfg.now(), ID: id, UserID: user.ID,
	})
	if isForeignKeyViolation(err) {
		parentFolderNotFound(w)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the folder", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not save the folder", err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, toFolderResponse(updated.ID, updated.ParentID, updated.Name))
}

// HandleDeleteFolder deletes a Folder and its subfolders, and moves every Note
// in any of them to the root; it never deletes a Note. If the Folder is not
// empty, it needs ?confirm=true, or it answers 409 with the counts and
// changes nothing.
func (cfg *ApiConfig) HandleDeleteFolder(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := folderID(w, r)
	if !ok {
		return
	}
	confirm := r.URL.Query().Get("confirm") == "true"

	tx, err := cfg.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete the folder", err)
		return
	}
	defer tx.Rollback()
	q := cfg.Db.WithTx(tx)

	if err := q.LockFolders(r.Context(), user.ID); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete the folder", err)
		return
	}
	if _, err := q.GetFolder(r.Context(), database.GetFolderParams{ID: id, UserID: user.ID}); errors.Is(err, sql.ErrNoRows) {
		folderNotFound(w)
		return
	} else if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete the folder", err)
		return
	}
	counts, err := q.CountFolderContents(r.Context(), database.CountFolderContentsParams{Root: id, UserID: user.ID})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete the folder", err)
		return
	}
	if (counts.Folders > 0 || counts.Notes > 0) && !confirm {
		utils.RespondJSON(w, http.StatusConflict, folderConflict{
			Error:   folderConflictMessage(counts.Folders, counts.Notes),
			Folders: counts.Folders,
			Notes:   counts.Notes,
		})
		return
	}
	if _, err := q.DeleteFolder(r.Context(), database.DeleteFolderParams{ID: id, UserID: user.ID}); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete the folder", err)
		return
	}
	if err := tx.Commit(); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not delete the folder", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func folderConflictMessage(folders, notes int64) string {
	var parts []string
	if folders > 0 {
		parts = append(parts, fmt.Sprintf("deletes %d %s", folders, plural(folders, "subfolder", "subfolders")))
	}
	if notes > 0 {
		parts = append(parts, fmt.Sprintf("moves %d %s to the root", notes, plural(notes, "note", "notes")))
	}
	return "Deleting this folder " + strings.Join(parts, " and ")
}

// HandleSetNoteFolder files a Note in one of the user's Folders, or at the
// root when folderId is null.
func (cfg *ApiConfig) HandleSetNoteFolder(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	id, ok := noteID(w, r)
	if !ok {
		return
	}
	var p struct {
		FolderID optionalID `json:"folderId"`
	}
	if !utils.DecodeJSON(w, r, &p) {
		return
	}
	if !p.FolderID.Set {
		utils.RespondError(w, http.StatusBadRequest, "folderId must be a folder's ID, or null for the root", nil)
		return
	}
	note, err := cfg.Db.SetNoteFolder(r.Context(), database.SetNoteFolderParams{
		FolderID: p.FolderID.Value, ID: id, UserID: user.ID,
	})
	// The Folder must be one of the user's; the foreign key checks that.
	if isForeignKeyViolation(err) {
		folderNotFound(w)
		return
	}
	if errors.Is(err, sql.ErrNoRows) {
		noteNotFound(w)
		return
	}
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not move the note", err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, toNoteResponse(note))
}

// folderID reads the Folder ID from the path. A malformed ID is answered like
// a missing Folder, since no Folder can have it.
func folderID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		folderNotFound(w)
		return 0, false
	}
	return id, true
}

// Another user's Folder answers the same as one that does not exist.
func folderNotFound(w http.ResponseWriter) {
	utils.RespondError(w, http.StatusNotFound, "Folder not found", nil)
}

func parentFolderNotFound(w http.ResponseWriter) {
	utils.RespondError(w, http.StatusNotFound, "Parent folder not found", nil)
}

func validateFolderName(name string) error {
	if validateNoteName(name) != nil {
		return errors.New("Folder name must be 1 to 200 characters with no control characters")
	}
	return nil
}

func isForeignKeyViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23503"
}

func nullableID(id sql.NullInt64) *int64 {
	if !id.Valid {
		return nil
	}
	return &id.Int64
}
