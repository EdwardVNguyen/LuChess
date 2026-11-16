package migrate_test

import (
	"bytes"
	"database/sql"
	"fmt"
	"io/fs"
	"log"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/EdwardVNguyen/LuChess/api/internal/migrate"
	"github.com/EdwardVNguyen/LuChess/api/internal/testdb"
	"github.com/EdwardVNguyen/LuChess/api/sql/schema"
	"github.com/pressly/goose/v3/lock"
)

const alreadyCurrent = "No pending migrations: the database schema is current\n"

// up runs the migrations and returns what they logged.
func up(t *testing.T, db *sql.DB) (string, error) {
	t.Helper()
	var out bytes.Buffer
	err := migrate.Up(t.Context(), db, log.New(&out, "", 0))
	return out.String(), err
}

// outcome is what one of several calls running at once came back with.
type outcome struct {
	logged string
	err    error
}

func upInBackground(t *testing.T, db *sql.DB, outcomes chan<- outcome) {
	go func() {
		logged, err := up(t, db)
		outcomes <- outcome{logged, err}
	}()
}

// migrationFiles are the embedded migrations, in the order they apply.
func migrationFiles(t *testing.T) []string {
	t.Helper()
	files, err := fs.Glob(schema.FS, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("no migrations are embedded")
	}
	return files
}

// appliedLines are the log lines naming the migrations a call applied, without their durations.
func appliedLines(logged string) []string {
	var lines []string
	for line := range strings.Lines(logged) {
		if name, ok := strings.CutPrefix(line, "Applied migration "); ok {
			lines = append(lines, name[:strings.Index(name, " ")])
		}
	}
	return lines
}

// versions are the migrations Goose has recorded, in the order they were applied.
func versions(t *testing.T, db *sql.DB) []int64 {
	t.Helper()
	rows, err := db.QueryContext(t.Context(), `SELECT version_id FROM goose_db_version WHERE version_id > 0 ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var v int64
		if err := rows.Scan(&v); err != nil {
			t.Fatal(err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

// wantVersions is every embedded migration recorded once, in order.
func wantVersions(t *testing.T) []int64 {
	t.Helper()
	var want []int64
	for _, file := range migrationFiles(t) {
		number, _, _ := strings.Cut(file, "_")
		v, err := strconv.ParseInt(number, 10, 64)
		if err != nil {
			t.Fatalf("migration %s does not start with its version: %v", file, err)
		}
		want = append(want, v)
	}
	return want
}

// snapshot describes everything in the public schema, and when Goose applied each migration.
func snapshot(t *testing.T, db *sql.DB) string {
	t.Helper()
	var out strings.Builder
	for _, query := range []string{
		`SELECT table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
		 FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1`,
		`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
		`SELECT conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
		 FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1`,
		`SELECT id || ' ' || version_id || ' ' || is_applied || ' ' || tstamp FROM goose_db_version ORDER BY id`,
	} {
		rows, err := db.QueryContext(t.Context(), query)
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			var line string
			if err := rows.Scan(&line); err != nil {
				t.Fatal(err)
			}
			out.WriteString(line + "\n")
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		rows.Close()
	}
	return out.String()
}

func TestAnEmptyDatabaseEndsFullyMigrated(t *testing.T) {
	db := testdb.NewEmpty(t)

	logged, err := up(t, db)
	if err != nil {
		t.Fatalf("migrating an empty database: %v", err)
	}

	if got, want := fmt.Sprint(versions(t, db)), fmt.Sprint(wantVersions(t)); got != want {
		t.Errorf("recorded versions = %s, want %s", got, want)
	}
	if got, want := fmt.Sprint(appliedLines(logged)), fmt.Sprint(migrationFiles(t)); got != want {
		t.Errorf("logged as applied = %s, want %s\nlog:\n%s", got, want, logged)
	}
}

func TestACurrentDatabaseIsLeftUnchanged(t *testing.T) {
	db := testdb.New(t)
	before := snapshot(t, db)

	logged, err := up(t, db)
	if err != nil {
		t.Fatalf("migrating a current database: %v", err)
	}

	if logged != alreadyCurrent {
		t.Errorf("log = %q, want %q", logged, alreadyCurrent)
	}
	if after := snapshot(t, db); after != before {
		t.Errorf("the database changed:\n%s\nbefore:\n%s", after, before)
	}
}

// Migration 004 creates the notes table, so a notes table already in the way
// fails it with 001 to 003 applied.
func TestAFailedMigrationStopsWithTheError(t *testing.T) {
	db := testdb.NewEmpty(t)
	if _, err := db.ExecContext(t.Context(), `CREATE TABLE notes (id INT)`); err != nil {
		t.Fatal(err)
	}

	logged, err := up(t, db)
	if err == nil {
		t.Fatalf("no error from a migration that cannot apply\nlog:\n%s", logged)
	}
	if !strings.Contains(err.Error(), `"notes" already exists`) {
		t.Errorf("error = %v, want it to carry the database's reason", err)
	}

	if got, want := fmt.Sprint(versions(t, db)), "[1 2 3]"; got != want {
		t.Errorf("recorded versions = %s, want %s", got, want)
	}
	if got, want := fmt.Sprint(appliedLines(logged)), fmt.Sprint(migrationFiles(t)[:3]); got != want {
		t.Errorf("logged as applied = %s, want %s\nlog:\n%s", got, want, logged)
	}
	if strings.Contains(logged, alreadyCurrent) {
		t.Errorf("a partly migrated schema was logged as current:\n%s", logged)
	}
}

// Two API processes starting at once. Each call locks on a connection of its
// own, as each process would.
func TestStartingTogetherAppliesEachMigrationOnce(t *testing.T) {
	db := testdb.NewEmpty(t)

	outcomes := make(chan outcome, 2)
	upInBackground(t, db, outcomes)
	upInBackground(t, db, outcomes)

	var applied []string
	for range 2 {
		o := <-outcomes
		if o.err != nil {
			t.Errorf("one of the two calls failed: %v", o.err)
		}
		applied = append(applied, appliedLines(o.logged)...)
	}

	if got, want := fmt.Sprint(applied), fmt.Sprint(migrationFiles(t)); got != want {
		t.Errorf("logged as applied by the two calls = %s, want %s", got, want)
	}
	if got, want := fmt.Sprint(versions(t, db)), fmt.Sprint(wantVersions(t)); got != want {
		t.Errorf("recorded versions = %s, want %s", got, want)
	}
}

// Another process is part-way through migrating: it holds Goose's lock. A call
// made meanwhile applies nothing until the lock is released.
func TestWaitsWhileAnotherProcessMigrates(t *testing.T) {
	db := testdb.NewEmpty(t)

	other, err := db.Conn(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	if _, err := other.ExecContext(t.Context(), `SELECT pg_advisory_lock($1)`, lock.DefaultLockID); err != nil {
		t.Fatal(err)
	}

	done := make(chan outcome, 1)
	upInBackground(t, db, done)

	select {
	case o := <-done:
		t.Fatalf("returned while another session held the lock (error: %v)\nlog:\n%s", o.err, o.logged)
	case <-time.After(500 * time.Millisecond):
	}
	var users sql.NullString
	if err := db.QueryRowContext(t.Context(), `SELECT to_regclass('public.users')`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users.Valid {
		t.Fatal("a migration was applied while another session held the lock")
	}

	if _, err := other.ExecContext(t.Context(), `SELECT pg_advisory_unlock($1)`, lock.DefaultLockID); err != nil {
		t.Fatal(err)
	}
	if o := <-done; o.err != nil {
		t.Fatalf("migrating once the lock was released: %v", o.err)
	}
	if got, want := fmt.Sprint(versions(t, db)), fmt.Sprint(wantVersions(t)); got != want {
		t.Errorf("recorded versions = %s, want %s", got, want)
	}
}
