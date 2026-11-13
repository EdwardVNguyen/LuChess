package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	handler "github.com/EdwardVNguyen/LuChess/api/handlers"
)

const frontendOrigin = "http://localhost:5173"

func newRouter() http.Handler {
	return handler.NewRouter(&handler.ApiConfig{FrontendOrigin: frontendOrigin})
}

func TestCORSAllowsTheFrontendOrigin(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", frontendOrigin)
	rec := httptest.NewRecorder()

	newRouter().ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != frontendOrigin {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, frontendOrigin)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Access-Control-Allow-Credentials = %q, want %q", got, "true")
	}
}

func preflight(origin string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodOptions, "/api/users", nil)
	req.Header.Set("Origin", origin)
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type,authorization")
	rec := httptest.NewRecorder()
	newRouter().ServeHTTP(rec, req)
	return rec
}

func TestCORSPreflightFromTheFrontendIsApproved(t *testing.T) {
	rec := preflight(frontendOrigin)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != frontendOrigin {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, frontendOrigin)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatal("Access-Control-Allow-Methods is empty")
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Fatal("Access-Control-Allow-Headers is empty")
	}
}

func TestCORSIgnoresOtherOrigins(t *testing.T) {
	for _, origin := range []string{"https://evil.example", "http://localhost:5174", "http://localhost:5173.evil.example"} {
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		req.Header.Set("Origin", origin)
		rec := httptest.NewRecorder()
		newRouter().ServeHTTP(rec, req)
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("origin %q: Access-Control-Allow-Origin = %q, want none", origin, got)
		}

		pre := preflight(origin)
		if got := pre.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("origin %q preflight: Access-Control-Allow-Origin = %q, want none", origin, got)
		}
		if pre.Code == http.StatusNoContent {
			t.Errorf("origin %q preflight: approved with 204", origin)
		}
	}
}

func TestHealthReportsOK(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	newRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decoding body: %v", err)
	}
	if body.Status != "ok" {
		t.Fatalf("status field = %q, want %q", body.Status, "ok")
	}
}
