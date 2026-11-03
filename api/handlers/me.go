package handler

import (
	"net/http"

	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

func (cfg *ApiConfig) HandleMe(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	utils.RespondJSON(w, http.StatusOK, publicUser{ID: user.ID, Email: user.Email, Name: user.Name})
}
