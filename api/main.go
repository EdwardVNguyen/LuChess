package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"database/sql"
	"net/http"

	"github.com/joho/godotenv"
	"github.com/EdwardVNguyen/LuChess/api/internal/database"
	"github.com/EdwardVNguyen/LuChess/api/handlers"
	"github.com/EdwardVNguyen/LuChess/api/internal/mailer"
	"github.com/EdwardVNguyen/LuChess/api/internal/migrate"
	"github.com/EdwardVNguyen/LuChess/api/internal/password"
	"github.com/EdwardVNguyen/LuChess/api/internal/session"
	_ "github.com/lib/pq"
)

func main() {
	// Local development variables (for now)
	const (
		defaultPort = "8080"
		envPort = "PORT"
		envDatabaseURL = "DB_URL" 
		envDatabaseType = "postgres"
		envFrontendOrigin = "FRONTEND_ORIGIN"
		envJWTSecret = "JWT_SECRET"
		envCookieSecure = "COOKIE_SECURE"
		minJWTSecretLen = 32
	)

	// Get environment variables
	if err := godotenv.Load(); err != nil {
		log.Fatal(err)
	}	

	port := os.Getenv(envPort)
	if port == "" {
		port = defaultPort
	}

	// Connect to the database
	db, err := sql.Open(envDatabaseType, os.Getenv(envDatabaseURL))
	if err != nil {
		log.Fatal(err)
	}

	// Bring the schema up to date before listening; never serve on a partly migrated one
	if err := migrate.Up(context.Background(), db, log.Default()); err != nil {
		log.Fatal(err)
	}

	// The only browser origin allowed to call the API; refuse to start without it
	frontendOrigin := os.Getenv(envFrontendOrigin)
	if frontendOrigin == "" {
		log.Fatalf("%s must be set", envFrontendOrigin)
	}

	// Signs access tokens; anyone who has it can forge a login, so refuse a weak or missing one
	jwtSecret := os.Getenv(envJWTSecret)
	if len(jwtSecret) < minJWTSecretLen {
		log.Fatalf("%s must be set to at least %d characters (generate one with: openssl rand -base64 48)", envJWTSecret, minJWTSecretLen)
	}

	// Holds shared dependencies for handlers
	apiCfg := handler.ApiConfig {
		Db: database.New(db),
		SQL: db,
		FrontendOrigin: frontendOrigin,
		// Development mailer: prints emails to this log. Production uses a real provider.
		Mailer: mailer.Console{Out: os.Stdout},
		Hasher: password.DefaultHasher,
		Session: session.New(session.Config{DB: db, Secret: []byte(jwtSecret)}),
		// On unless explicitly turned off, for a browser that refuses Secure cookies over plain HTTP
		CookieSecure: os.Getenv(envCookieSecure) != "false",
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
