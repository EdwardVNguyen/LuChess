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
	"github.com/EdwardVNguyen/ChessNotes/api/internal/mailer"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/password"
	_ "github.com/lib/pq"
)

func main() {
	// Local development variables (for now)
	const (
		port = "8080"
		envDatabaseURL = "DB_URL" 
		envDatabaseType = "postgres"
		envFrontendOrigin = "FRONTEND_ORIGIN"
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

	// The only browser origin allowed to call the API; refuse to start without it
	frontendOrigin := os.Getenv(envFrontendOrigin)
	if frontendOrigin == "" {
		log.Fatalf("%s must be set", envFrontendOrigin)
	}

	// Holds shared dependencies for handlers
	apiCfg := handler.ApiConfig {
		Db: database.New(db),
		SQL: db,
		FrontendOrigin: frontendOrigin,
		// Development mailer: prints emails to this log. Production uses a real provider.
		Mailer: mailer.Console{Out: os.Stdout},
		Hasher: password.DefaultHasher,
	}

	// Run the server
	server := &http.Server{
		Addr: ":" + port,
		Handler: handler.NewRouter(&apiCfg),
	}

	fmt.Printf("Server running on port %s\n", port)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	} 
}
