package handler

import (
	"net/http"

	"github.com/EdwardVNguyen/ChessNotes/api/utils"
)

// Mux is responsible for matching HTTP request URLs with endpoints and executing handlers
func NewRouter(cfg *ApiConfig) http.Handler {
	cfg.buildLimiters()
	cfg.sessionHTTP = &sessionHTTP{cfg: cfg, sessions: cfg.Session}
	cfg.dummyHash, _ = cfg.Hasher.Hash("a password nobody has")
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", cfg.HandleHealth)
	mux.HandleFunc("POST /api/auth/signup", cfg.HandleSignUp)
	mux.HandleFunc("POST /api/auth/verify-email", cfg.HandleVerifyEmail)
	mux.HandleFunc("POST /api/auth/resend-verification", cfg.HandleResendVerification)
	mux.HandleFunc("POST /api/auth/forgot-password", cfg.HandleForgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", cfg.HandleResetPassword)
	mux.HandleFunc("POST /api/auth/login", cfg.HandleLogin)
	mux.HandleFunc("POST /api/auth/refresh", cfg.sessionHTTP.HandleRefresh)
	mux.HandleFunc("POST /api/auth/logout", cfg.sessionHTTP.HandleLogout)
	mux.Handle("GET /api/me", cfg.sessionHTTP.RequireAuth(cfg.HandleMe))
	mux.Handle("GET /api/notes", cfg.sessionHTTP.RequireAuth(cfg.HandleListNotes))
	mux.Handle("GET /api/notes/search", cfg.sessionHTTP.RequireAuth(cfg.HandleSearchNotes))
	mux.Handle("POST /api/notes", cfg.sessionHTTP.RequireAuth(cfg.HandleCreateNote))
	mux.Handle("GET /api/notes/{id}", cfg.sessionHTTP.RequireAuth(cfg.HandleGetNote))
	mux.Handle("PATCH /api/notes/{id}", cfg.sessionHTTP.RequireAuth(cfg.HandleRenameNote))
	mux.Handle("DELETE /api/notes/{id}", cfg.sessionHTTP.RequireAuth(cfg.HandleDeleteNote))
	mux.Handle("GET /api/notes/{id}/plies", cfg.sessionHTTP.RequireAuth(cfg.HandleListPlies))
	mux.Handle("PUT /api/notes/{id}/plies/{ply}", cfg.sessionHTTP.RequireAuth(cfg.HandlePutPly))
	mux.Handle("GET /api/notes/{id}/links", cfg.sessionHTTP.RequireAuth(cfg.HandleNoteLinks))

	return cfg.WithCORS(mux)
}

func (cfg *ApiConfig) HandleHealth(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "ok"})
}
