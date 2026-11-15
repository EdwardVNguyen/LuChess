// Package testdb gives each test its own freshly migrated Postgres database.
//
// A template database is built once from the Goose migrations and named after a
// hash of them, so it is rebuilt automatically when a migration changes. Each
// test then gets a cheap copy of that template, which keeps tests isolated and
// lets them run in parallel against real constraints and cascades.
package testdb

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/url"
	"os"
	"sync"
	"testing"

	"github.com/EdwardVNguyen/LuChess/api/internal/migrate"
	"github.com/EdwardVNguyen/LuChess/api/sql/schema"
	"github.com/lib/pq"
)

const (
	// Matches api/docker-compose.yml
	defaultAdminURL = "postgres://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable"
	adminURLEnv     = "TEST_DB_URL"

	templatePrefix = "chessnotes_tpl_"
	testPrefix     = "chessnotes_test_"
	// Postgres's own pristine database
	emptyTemplate = "template0"

	// Serializes template builds and clones across every test process
	advisoryLockKey = 7243801
)

var (
	templateOnce sync.Once
	templateName string
	templateErr  error
)

// New returns a connection to a new, empty-but-migrated database that is
// dropped when the test ends.
func New(t testing.TB) *sql.DB {
	t.Helper()
	adminURL, admin := connectAdmin(t)

	templateOnce.Do(func() { templateName, templateErr = buildTemplate(t.Context(), adminURL, admin) })
	if templateErr != nil {
		t.Fatalf("testdb: building template database: %v", templateErr)
	}
	return create(t, adminURL, admin, templateName)
}

// NewEmpty returns a connection to a new database with nothing in it, not even
// Goose's version table, for testing the migrations themselves. It is dropped
// when the test ends.
func NewEmpty(t testing.TB) *sql.DB {
	t.Helper()
	adminURL, admin := connectAdmin(t)
	return create(t, adminURL, admin, emptyTemplate)
}

func connectAdmin(t testing.TB) (string, *sql.DB) {
	t.Helper()

	adminURL := os.Getenv(adminURLEnv)
	if adminURL == "" {
		adminURL = defaultAdminURL
	}

	admin, err := sql.Open("postgres", adminURL)
	if err != nil {
		t.Fatalf("testdb: opening admin connection: %v", err)
	}
	t.Cleanup(func() { admin.Close() })
	if err := admin.PingContext(t.Context()); err != nil {
		t.Fatalf("testdb: cannot reach Postgres at %s (%v)\n"+
			"Start it with: docker compose -f api/docker-compose.yml up -d --wait\n"+
			"or point %s at another server.", redact(adminURL), err, adminURLEnv)
	}
	return adminURL, admin
}

// create makes a database as a copy of template, and drops it when the test ends.
func create(t testing.TB, adminURL string, admin *sql.DB, template string) *sql.DB {
	t.Helper()
	ctx := t.Context()

	name := testPrefix + randomSuffix()
	if err := withLock(ctx, admin, func(conn *sql.Conn) error {
		_, err := conn.ExecContext(ctx, fmt.Sprintf("CREATE DATABASE %s TEMPLATE %s",
			pq.QuoteIdentifier(name), pq.QuoteIdentifier(template)))
		return err
	}); err != nil {
		t.Fatalf("testdb: cloning %s: %v", template, err)
	}

	db, err := sql.Open("postgres", withDatabase(adminURL, name))
	if err != nil {
		t.Fatalf("testdb: opening test database: %v", err)
	}
	t.Cleanup(func() {
		db.Close()
		// The test context is already cancelled during cleanup
		_, err := admin.ExecContext(context.Background(),
			fmt.Sprintf("DROP DATABASE IF EXISTS %s WITH (FORCE)", pq.QuoteIdentifier(name)))
		if err != nil {
			t.Errorf("testdb: dropping %s: %v", name, err)
		}
	})
	return db
}

func buildTemplate(ctx context.Context, adminURL string, admin *sql.DB) (string, error) {
	hash, err := migrationsHash()
	if err != nil {
		return "", err
	}
	name := templatePrefix + hash
	building := name + "_building"

	err = withLock(ctx, admin, func(conn *sql.Conn) error {
		var exists bool
		if err := conn.QueryRowContext(ctx,
			"SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)", name).Scan(&exists); err != nil {
			return err
		}
		if exists {
			return nil
		}

		// Build under a temporary name and rename at the end, so a crash can
		// never leave a half-migrated database that looks like a finished template.
		if _, err := conn.ExecContext(ctx, "DROP DATABASE IF EXISTS "+pq.QuoteIdentifier(building)+" WITH (FORCE)"); err != nil {
			return err
		}
		if _, err := conn.ExecContext(ctx, "CREATE DATABASE "+pq.QuoteIdentifier(building)); err != nil {
			return err
		}
		if err := migrateDatabase(ctx, withDatabase(adminURL, building)); err != nil {
			return err
		}
		if _, err := conn.ExecContext(ctx, fmt.Sprintf("ALTER DATABASE %s RENAME TO %s",
			pq.QuoteIdentifier(building), pq.QuoteIdentifier(name))); err != nil {
			return err
		}
		dropStaleTemplates(ctx, conn, name)
		return nil
	})
	return name, err
}

func migrateDatabase(ctx context.Context, dbURL string) error {
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return err
	}
	defer db.Close()

	// The call the API makes when it starts, without its log lines
	return migrate.Up(ctx, db, log.New(io.Discard, "", 0))
}

// Templates for older migration sets are useless; remove them. A drop that
// fails because another test run still uses one is fine to skip.
func dropStaleTemplates(ctx context.Context, conn *sql.Conn, keep string) {
	rows, err := conn.QueryContext(ctx,
		"SELECT datname FROM pg_database WHERE datname LIKE $1 AND datname <> $2", templatePrefix+"%", keep)
	if err != nil {
		return
	}
	var stale []string
	for rows.Next() {
		var n string
		if rows.Scan(&n) == nil {
			stale = append(stale, n)
		}
	}
	rows.Close()
	for _, n := range stale {
		conn.ExecContext(ctx, "DROP DATABASE IF EXISTS "+pq.QuoteIdentifier(n))
	}
}

func withLock(ctx context.Context, admin *sql.DB, fn func(conn *sql.Conn) error) error {
	conn, err := admin.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "SELECT pg_advisory_lock($1)", advisoryLockKey); err != nil {
		return err
	}
	defer conn.ExecContext(context.Background(), "SELECT pg_advisory_unlock($1)", advisoryLockKey)

	return fn(conn)
}

func migrationsHash() (string, error) {
	entries, err := fs.ReadDir(schema.FS, ".")
	if err != nil {
		return "", err
	}
	h := sha256.New()
	for _, e := range entries { // ReadDir returns entries sorted by name
		data, err := fs.ReadFile(schema.FS, e.Name())
		if err != nil {
			return "", err
		}
		fmt.Fprintf(h, "%s\x00%d\x00", e.Name(), len(data))
		h.Write(data)
	}
	return hex.EncodeToString(h.Sum(nil))[:12], nil
}

func randomSuffix() string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func withDatabase(rawURL, name string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		panic(fmt.Sprintf("testdb: invalid %s: %v", adminURLEnv, err))
	}
	u.Path = "/" + name
	return u.String()
}

func redact(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "<invalid url>"
	}
	return u.Redacted()
}
