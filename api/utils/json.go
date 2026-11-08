package utils

import (
	"net/http"
	"log"
	"encoding/json"
)

// Auth requests are tiny; the cap stops a huge body being read into memory
const maxBodyBytes = 16 * 1024

// DecodeJSON reads a small JSON request body into dst, answering 400 itself on failure.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	return DecodeJSONLimit(w, r, dst, maxBodyBytes)
}

// DecodeJSONLimit is DecodeJSON for bodies up to limit bytes.
func DecodeJSONLimit(w http.ResponseWriter, r *http.Request, dst any, limit int64) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit)).Decode(dst); err != nil {
		RespondError(w, http.StatusBadRequest, "Could not read JSON from HTTP request body", err)
		return false
	}
	return true
}

// Shared interface for errors so that code is more maintainable
func RespondError(w http.ResponseWriter, code int, msg string, err error) {
	type ErrorResponse struct {
		Error string `json:"error"`
	}
	if err != nil {
		log.Printf("error: %s\n", err)
	}

	RespondJSON(w, code, ErrorResponse{Error: msg})
}

// Input: any type of data like a struct and given status code, Output: returns HTTP response body as JSON
func RespondJSON(w http.ResponseWriter, code int, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshalling JSON: %s\n", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(data)
}
