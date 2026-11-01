package handler

import (
	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
)

type ApiConfig struct {
	Db *database.Queries
	// FrontendOrigin is the only origin allowed to call the API from a browser
	FrontendOrigin string
}
