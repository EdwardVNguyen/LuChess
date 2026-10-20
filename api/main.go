package main

import (
	"fmt"
	"log"
	"os"
	"database/sql"
	"net/http"

	"github.com/joho/godotenv"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/EdwardVNguyen/ChessNotes/api/handlers"
	_ "github.com/lib/pq"
)

func main() {
	// Local development variables (for now)
	const (
		port = "8080"
		envDatabaseURL = "DB_URL" 
		envDatabaseType = "postgres"
	)

	// Get environment variables
	if err := godotenv.Load(); err != nil {
		log.Fatal(err)
	}	

	// Connect to the database
	db, err := sql.Open(envDatabaseType, os.Getenv(envDatabaseURL))
	if err != nil {
		log.Fatal(err)
	}

	// Holds shared dependencies for handlers
	apiCfg := handler.ApiConfig {
		Db: database.New(db),
	}

	// Mux is responsbile for matching HTTP request URLs with endpoints and executing handlers
	mux := http.NewServeMux()

	// Endpoints
	mux.HandleFunc("POST /api/users", apiCfg.HandleCreateUser)

	// Run the server
	server := &http.Server{
		Addr: ":" + port,
		Handler: mux,
	}

	fmt.Printf("Server running on port %s\n", port)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	} 
}
