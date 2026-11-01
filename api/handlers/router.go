package handler

import (
	"net/http"

	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

// Mux is responsible for matching HTTP request URLs with endpoints and executing handlers
func NewRouter(cfg *ApiConfig) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", cfg.HandleHealth)
	mux.HandleFunc("POST /api/users", cfg.HandleCreateUser)

	return cfg.WithCORS(mux)
}

func (cfg *ApiConfig) HandleHealth(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "ok"})
}
