package utils

import (
	"net/http"
	"log"
	"encoding/json"
)

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
