package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

type folderResponse struct {
	ID       int64  `json:"id"`
	ParentID *int64 `json:"parentId"`
	Name     string `json:"name"`
}

type noteWithFolder struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	FolderID *int64 `json:"folderId"`
}

func folderPath(id int64) string { return fmt.Sprintf("/api/folders/%d", id) }

func folderBody(name string, parentID *int64) string {
	b, _ := json.Marshal(map[string]any{"name": name, "parentId": parentID})
	return string(b)
}

func (a *app) createFolder(s session, name string, parentID *int64) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.send(http.MethodPost, "/api/folders", folderBody(name, parentID), withBearer(s.AccessToken))
}

func (a *app) mustCreateFolder(s session, name string, parentID *int64) folderResponse {
	a.t.Helper()
	rec := a.createFolder(s, name, parentID)
	if rec.Code != http.StatusCreated {
		a.t.Fatalf("create folder %q: status = %d (body %s)", name, rec.Code, rec.Body)
	}
	var f folderResponse
	decodeInto(a.t, rec, &f)
	return f
}

func (a *app) listFolders(s session) []folderResponse {
	a.t.Helper()
	rec := a.send(http.MethodGet, "/api/folders", "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list folders: status = %d (body %s)", rec.Code, rec.Body)
	}
	var folders []folderResponse
	decodeInto(a.t, rec, &folders)
	return folders
}

func (a *app) fileNote(s session, noteID int64, folderID *int64) *httptest.ResponseRecorder {
	a.t.Helper()
	b, _ := json.Marshal(map[string]any{"folderId": folderID})
	return a.send(http.MethodPut, notePath(noteID)+"/folder", string(b), withBearer(s.AccessToken))
}

func (a *app) mustFileNote(s session, noteID int64, folderID *int64) {
	a.t.Helper()
	if rec := a.fileNote(s, noteID, folderID); rec.Code != http.StatusOK {
		a.t.Fatalf("file note %d: status = %d (body %s)", noteID, rec.Code, rec.Body)
	}
}

func (a *app) notesWithFolders(s session) map[string]*int64 {
	a.t.Helper()
	rec := a.send(http.MethodGet, "/api/notes", "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list notes: status = %d (body %s)", rec.Code, rec.Body)
	}
	var notes []noteWithFolder
	decodeInto(a.t, rec, &notes)
	out := map[string]*int64{}
	for _, n := range notes {
		out[n.Name] = n.FolderID
	}
	return out
}

func (a *app) deleteFolder(s session, id int64, confirm bool) *httptest.ResponseRecorder {
	a.t.Helper()
	path := folderPath(id)
	if confirm {
		path += "?confirm=true"
	}
	return a.send(http.MethodDelete, path, "", withBearer(s.AccessToken))
}

func ptr(id int64) *int64 { return &id }

func eqID(got *int64, want *int64) bool {
	if got == nil || want == nil {
		return got == want
	}
	return *got == *want
}

func TestCreateNestedFoldersAndListThem(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")

	openings := a.mustCreateFolder(s, "  Openings ", nil)
	qgd := a.mustCreateFolder(s, "Queen's Gambit Declined", &openings.ID)
	a.mustCreateFolder(s, "concepts", nil)

	if openings.Name != "Openings" || openings.ParentID != nil {
		t.Fatalf("openings = %+v", openings)
	}
	if qgd.ParentID == nil || *qgd.ParentID != openings.ID {
		t.Fatalf("qgd parent = %v, want %d", qgd.ParentID, openings.ID)
	}
	var names []string
	for _, f := range a.listFolders(s) {
		names = append(names, f.Name)
	}
	// Sorted by name, ignoring case
	if strings.Join(names, "|") != "concepts|Openings|Queen's Gambit Declined" {
		t.Fatalf("names = %v", names)
	}
}

func TestCreateFolderRejectsBadNames(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	for _, name := range []string{"", "   ", strings.Repeat("a", 201), "a\x07b"} {
		if rec := a.createFolder(s, name, nil); rec.Code != http.StatusBadRequest {
			t.Fatalf("name %q: status = %d, want 400", name, rec.Code)
		}
	}
	if n := len(a.listFolders(s)); n != 0 {
		t.Fatalf("%d folders saved, want 0", n)
	}
}

func TestRenameAndMoveAFolder(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	openings := a.mustCreateFolder(s, "Openings", nil)
	qgd := a.mustCreateFolder(s, "QGD", nil)

	rec := a.send(http.MethodPatch, folderPath(qgd.ID), fmt.Sprintf(`{"name":" Queen's Gambit ","parentId":%d}`, openings.ID), withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		t.Fatalf("move: status = %d (body %s)", rec.Code, rec.Body)
	}
	var got folderResponse
	decodeInto(t, rec, &got)
	if got.Name != "Queen's Gambit" || !eqID(got.ParentID, &openings.ID) {
		t.Fatalf("folder = %+v", got)
	}

	// Renaming alone leaves the parent where it is
	rec = a.send(http.MethodPatch, folderPath(qgd.ID), `{"name":"QGD"}`, withBearer(s.AccessToken))
	decodeInto(t, rec, &got)
	if got.Name != "QGD" || !eqID(got.ParentID, &openings.ID) {
		t.Fatalf("after rename: %+v", got)
	}

	// A null parent moves it back to the root, keeping the name
	rec = a.send(http.MethodPatch, folderPath(qgd.ID), `{"parentId":null}`, withBearer(s.AccessToken))
	decodeInto(t, rec, &got)
	if got.Name != "QGD" || got.ParentID != nil {
		t.Fatalf("after move to root: %+v", got)
	}
}

func TestAFolderCannotMoveIntoItselfOrItsSubfolders(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	top := a.mustCreateFolder(s, "Top", nil)
	middle := a.mustCreateFolder(s, "Middle", &top.ID)
	bottom := a.mustCreateFolder(s, "Bottom", &middle.ID)

	for _, target := range []int64{top.ID, middle.ID, bottom.ID} {
		rec := a.send(http.MethodPatch, folderPath(top.ID), fmt.Sprintf(`{"parentId":%d}`, target), withBearer(s.AccessToken))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("into %d: status = %d, want 400 (body %s)", target, rec.Code, rec.Body)
		}
	}
	for _, f := range a.listFolders(s) {
		if f.ID == top.ID && f.ParentID != nil {
			t.Fatalf("top moved to %d", *f.ParentID)
		}
	}

	// Moving a subfolder up is fine
	if rec := a.send(http.MethodPatch, folderPath(bottom.ID), fmt.Sprintf(`{"parentId":%d}`, top.ID), withBearer(s.AccessToken)); rec.Code != http.StatusOK {
		t.Fatalf("move bottom up: status = %d (body %s)", rec.Code, rec.Body)
	}
}

func TestMoveANoteBetweenFoldersAndToTheRoot(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	openings := a.mustCreateFolder(s, "Openings", nil)
	endgames := a.mustCreateFolder(s, "Endgames", nil)
	n := a.mustCreateNote(s, "Lucena", sampleTags, nil)
	before := a.getNote(s, n.ID)
	a.clock.Advance(1)

	if got := a.notesWithFolders(s)["Lucena"]; got != nil {
		t.Fatalf("a new note is in folder %d, want the root", *got)
	}

	a.mustFileNote(s, n.ID, &openings.ID)
	if got := a.notesWithFolders(s)["Lucena"]; !eqID(got, &openings.ID) {
		t.Fatalf("folder = %v, want %d", got, openings.ID)
	}

	rec := a.fileNote(s, n.ID, &endgames.ID)
	var moved noteWithFolder
	decodeInto(t, rec, &moved)
	if !eqID(moved.FolderID, &endgames.ID) {
		t.Fatalf("response folder = %v, want %d", moved.FolderID, endgames.ID)
	}
	var full noteResponse
	decodeInto(t, a.send(http.MethodGet, notePath(n.ID), "", withBearer(s.AccessToken)), &full)
	if !full.UpdatedAt.Equal(before.UpdatedAt) {
		t.Fatal("filing a note changed its updatedAt")
	}

	a.mustFileNote(s, n.ID, nil)
	if got := a.notesWithFolders(s)["Lucena"]; got != nil {
		t.Fatalf("folder = %d, want the root", *got)
	}
}

func TestFilingANoteNeedsAFolderID(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	n := a.mustCreateNote(s, "Lucena", sampleTags, nil)

	if rec := a.send(http.MethodPut, notePath(n.ID)+"/folder", `{}`, withBearer(s.AccessToken)); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if rec := a.fileNote(s, n.ID, ptr(999999)); rec.Code != http.StatusNotFound {
		t.Fatalf("missing folder: status = %d, want 404", rec.Code)
	}
}

func TestCreatingANoteInAFolder(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	endgames := a.mustCreateFolder(s, "Endgames", nil)

	body := fmt.Sprintf(`{"name":"Lucena","folderId":%d}`, endgames.ID)
	rec := a.createNote(s, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d (body %s)", rec.Code, rec.Body)
	}
	var created noteWithFolder
	decodeInto(t, rec, &created)
	if !eqID(created.FolderID, &endgames.ID) {
		t.Fatalf("response folder = %v, want %d", created.FolderID, endgames.ID)
	}
	if got := a.notesWithFolders(s)["Lucena"]; !eqID(got, &endgames.ID) {
		t.Fatalf("folder = %v, want %d", got, endgames.ID)
	}

	// Another user's Folder answers like a missing one, and no Note is made
	other := loggedInAs(t, a, "bob@example.com", "Bob")
	theirs := a.mustCreateFolder(other, "Theirs", nil)
	body = fmt.Sprintf(`{"name":"Elsewhere","folderId":%d}`, theirs.ID)
	if rec := a.createNote(s, body); rec.Code != http.StatusNotFound {
		t.Fatalf("another user's folder: status = %d, want 404", rec.Code)
	}
	if _, ok := a.notesWithFolders(s)["Elsewhere"]; ok {
		t.Fatal("a note was made in another user's folder")
	}
}

func TestDeletingAnEmptyFolderNeedsNoConfirmation(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	f := a.mustCreateFolder(s, "Empty", nil)

	if rec := a.deleteFolder(s, f.ID, false); rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204 (body %s)", rec.Code, rec.Body)
	}
	if n := len(a.listFolders(s)); n != 0 {
		t.Fatalf("%d folders left", n)
	}
	if rec := a.deleteFolder(s, f.ID, true); rec.Code != http.StatusNotFound {
		t.Fatalf("second delete: status = %d, want 404", rec.Code)
	}
}

func TestDeletingAFolderWithContentsIsConfirmedAndKeepsEveryNote(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	openings := a.mustCreateFolder(s, "Openings", nil)
	qgd := a.mustCreateFolder(s, "QGD", &openings.ID)
	tartakower := a.mustCreateFolder(s, "Tartakower", &qgd.ID)
	a.mustCreateFolder(s, "Sicilian", &openings.ID)
	endgames := a.mustCreateFolder(s, "Endgames", nil)

	inOpenings := a.mustCreateNote(s, "In openings", sampleTags, nil)
	inQGD := a.mustCreateNote(s, "In QGD", sampleTags, nil)
	inTartakower := a.mustCreateNote(s, "In Tartakower", sampleTags, nil)
	inEndgames := a.mustCreateNote(s, "In endgames", sampleTags, nil)
	a.mustCreateNote(s, "At the root", sampleTags, nil)
	a.mustFileNote(s, inOpenings.ID, &openings.ID)
	a.mustFileNote(s, inQGD.ID, &qgd.ID)
	a.mustFileNote(s, inTartakower.ID, &tartakower.ID)
	a.mustFileNote(s, inEndgames.ID, &endgames.ID)

	rec := a.deleteFolder(s, openings.ID, false)
	if rec.Code != http.StatusConflict {
		t.Fatalf("unconfirmed: status = %d, want 409 (body %s)", rec.Code, rec.Body)
	}
	var conflict struct {
		Error   string `json:"error"`
		Folders int64  `json:"folders"`
		Notes   int64  `json:"notes"`
	}
	decodeInto(t, rec, &conflict)
	if conflict.Folders != 3 || conflict.Notes != 3 || conflict.Error == "" {
		t.Fatalf("conflict = %+v, want 3 subfolders and 3 notes", conflict)
	}
	if n := len(a.listFolders(s)); n != 5 {
		t.Fatalf("unconfirmed delete changed the folders: %d left", n)
	}

	if rec := a.deleteFolder(s, openings.ID, true); rec.Code != http.StatusNoContent {
		t.Fatalf("confirmed: status = %d, want 204 (body %s)", rec.Code, rec.Body)
	}

	folders := a.listFolders(s)
	if len(folders) != 1 || folders[0].ID != endgames.ID {
		t.Fatalf("folders left = %+v, want only Endgames", folders)
	}
	notes := a.notesWithFolders(s)
	if len(notes) != 5 {
		t.Fatalf("%d notes left, want all 5", len(notes))
	}
	for _, name := range []string{"In openings", "In QGD", "In Tartakower", "At the root"} {
		if notes[name] != nil {
			t.Fatalf("%q is in folder %d, want the root", name, *notes[name])
		}
	}
	if !eqID(notes["In endgames"], &endgames.ID) {
		t.Fatalf("In endgames moved to %v", notes["In endgames"])
	}
}

func TestDeletingASubfolderLeavesItsParent(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	openings := a.mustCreateFolder(s, "Openings", nil)
	qgd := a.mustCreateFolder(s, "QGD", &openings.ID)
	n := a.mustCreateNote(s, "In QGD", sampleTags, nil)
	a.mustFileNote(s, n.ID, &qgd.ID)

	rec := a.deleteFolder(s, qgd.ID, false)
	var conflict struct {
		Folders int64 `json:"folders"`
		Notes   int64 `json:"notes"`
	}
	decodeInto(t, rec, &conflict)
	if rec.Code != http.StatusConflict || conflict.Folders != 0 || conflict.Notes != 1 {
		t.Fatalf("status = %d, conflict = %+v", rec.Code, conflict)
	}
	a.deleteFolder(s, qgd.ID, true)

	folders := a.listFolders(s)
	if len(folders) != 1 || folders[0].ID != openings.ID {
		t.Fatalf("folders = %+v", folders)
	}
	if got := a.notesWithFolders(s)["In QGD"]; got != nil {
		t.Fatalf("note in folder %d, want the root", *got)
	}
}

func TestAnotherUsersFoldersAreNotFound(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")
	adas := a.mustCreateFolder(ada, "Private", nil)
	bobsFolder := a.mustCreateFolder(bob, "Bob's", nil)
	adasNote := a.mustCreateNote(ada, "Ada's note", sampleTags, nil)
	bobsNote := a.mustCreateNote(bob, "Bob's note", sampleTags, nil)

	requests := map[string]*httptest.ResponseRecorder{
		"rename":                  a.send(http.MethodPatch, folderPath(adas.ID), `{"name":"Mine now"}`, withBearer(bob.AccessToken)),
		"delete":                  a.deleteFolder(bob, adas.ID, true),
		"create inside":           a.createFolder(bob, "Sneaky", &adas.ID),
		"move own folder into it": a.send(http.MethodPatch, folderPath(bobsFolder.ID), fmt.Sprintf(`{"parentId":%d}`, adas.ID), withBearer(bob.AccessToken)),
		"file own note in it":     a.fileNote(bob, bobsNote.ID, &adas.ID),
		"file her note":           a.fileNote(bob, adasNote.ID, &bobsFolder.ID),
	}
	for name, rec := range requests {
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d, want 404 (body %s)", name, rec.Code, rec.Body)
		}
	}

	if got := a.listFolders(bob); len(got) != 1 || got[0].ID != bobsFolder.ID || got[0].ParentID != nil {
		t.Fatalf("Bob's folders = %+v", got)
	}
	if got := a.listFolders(ada); len(got) != 1 || got[0].Name != "Private" {
		t.Fatalf("Ada's folders = %+v", got)
	}
	if got := a.notesWithFolders(ada)["Ada's note"]; got != nil {
		t.Fatalf("Ada's note filed in %d", *got)
	}
}

func TestMalformedFolderIDIsNotFound(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	for _, id := range []string{"abc", "0", "-1"} {
		if rec := a.send(http.MethodDelete, "/api/folders/"+id, "", withBearer(s.AccessToken)); rec.Code != http.StatusNotFound {
			t.Fatalf("id %q: status = %d, want 404", id, rec.Code)
		}
	}
}

func TestFolderEndpointsRequireAuth(t *testing.T) {
	a := newApp(t)
	for _, req := range []struct{ method, path string }{
		{http.MethodGet, "/api/folders"},
		{http.MethodPost, "/api/folders"},
		{http.MethodPatch, "/api/folders/1"},
		{http.MethodDelete, "/api/folders/1"},
		{http.MethodPut, "/api/notes/1/folder"},
	} {
		if rec := a.send(req.method, req.path, ""); rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: status = %d, want 401", req.method, req.path, rec.Code)
		}
	}
}

func TestSearchMatchesFolderNamesAndShowsTheFolderPath(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	masters := a.mustCreateFolder(s, "Masters", nil)
	spassky := a.mustCreateFolder(s, "Spassky", &masters.ID)
	inFolder := a.mustCreateNote(s, "Game 6", sampleTags, nil)
	a.mustFileNote(s, inFolder.ID, &spassky.ID)
	a.mustCreateNote(s, "Rook endings", sampleTags, nil)

	got := a.searchWithPaths(s, "masters")

	if len(got) != 1 || got[0].ID != inFolder.ID {
		t.Fatalf("results = %+v", got)
	}
	if !slices.Equal(got[0].FolderPath, []string{"Masters", "Spassky"}) {
		t.Fatalf("folder path = %v", got[0].FolderPath)
	}

	if root := a.searchWithPaths(s, "Rook"); len(root) != 1 || root[0].FolderPath == nil || len(root[0].FolderPath) != 0 {
		t.Fatalf("a note at the root should have an empty path, got %+v", root)
	}
}

func TestSearchTellsSameNamedNotesApartByFolder(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	fischer := a.mustCreateFolder(s, "Fischer", nil)
	club := a.mustCreateFolder(s, "Club games", nil)
	first := a.mustCreateNote(s, "Game 6", sampleTags, nil)
	second := a.mustCreateNote(s, "Game 6", sampleTags, nil)
	a.mustFileNote(s, first.ID, &fischer.ID)
	a.mustFileNote(s, second.ID, &club.ID)

	paths := map[int64][]string{}
	for _, r := range a.searchWithPaths(s, "Game 6") {
		paths[r.ID] = r.FolderPath
	}
	if !slices.Equal(paths[first.ID], []string{"Fischer"}) || !slices.Equal(paths[second.ID], []string{"Club games"}) {
		t.Fatalf("paths = %v", paths)
	}
}

func TestSearchRanksNameMatchesAboveFolderMatches(t *testing.T) {
	a := newApp(t)
	s := loggedInAs(t, a, "ada@example.com", "Ada")
	endgames := a.mustCreateFolder(s, "Endgames", nil)
	byFolder := a.mustCreateNote(s, "Lucena", sampleTags, nil)
	a.mustFileNote(s, byFolder.ID, &endgames.ID)
	a.clock.Advance(1)
	a.mustCreateNote(s, "Endgames I lost", sampleTags, nil)

	got := names(a.search(s, "endgames"))

	if len(got) != 2 || got[0] != "Endgames I lost" || got[1] != "Lucena" {
		t.Fatalf("results = %v", got)
	}
}

func TestSearchNeverMatchesAnotherUsersFolders(t *testing.T) {
	a := newApp(t)
	ada := loggedInAs(t, a, "ada@example.com", "Ada")
	bob := loggedInAs(t, a, "bob@example.com", "Bob")
	a.mustCreateFolder(bob, "Masters", nil)
	a.mustCreateNote(ada, "Game 6", sampleTags, nil)

	if got := a.search(ada, "Masters"); len(got) != 0 {
		t.Fatalf("results = %v", names(got))
	}
}

type searchResultWithPath struct {
	ID         int64    `json:"id"`
	Name       string   `json:"name"`
	FolderPath []string `json:"folderPath"`
}

func (a *app) searchWithPaths(s session, q string) []searchResultWithPath {
	a.t.Helper()
	rec := a.send(http.MethodGet, "/api/notes/search?q="+strings.ReplaceAll(q, " ", "+"), "", withBearer(s.AccessToken))
	if rec.Code != http.StatusOK {
		a.t.Fatalf("search %q: status = %d (body %s)", q, rec.Code, rec.Body)
	}
	var results []searchResultWithPath
	decodeInto(a.t, rec, &results)
	return results
}
