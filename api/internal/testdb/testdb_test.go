package testdb_test

import (
	"database/sql"
	"fmt"
	"testing"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/testdb"
	"github.com/EdwardVNguyen/ChessNotes/api/sql/schema"
	"github.com/pressly/goose/v3"
)

func TestEachTestGetsItsOwnMigratedDatabase(t *testing.T) {
	// Every subtest inserts the same unique email. If they shared a database,
	// all but one would fail on the users.email constraint.
	for i := range 8 {
		t.Run(fmt.Sprintf("test-%d", i), func(t *testing.T) {
			t.Parallel()
			db := testdb.New(t)

			_, err := db.ExecContext(t.Context(),
				`INSERT INTO users (email, password_hash, name) VALUES ('same@example.com', 'x', 'same')`)
			if err != nil {
				t.Fatalf("inserting into a freshly migrated database: %v", err)
			}

			var count int
			if err := db.QueryRowContext(t.Context(), `SELECT count(*) FROM users`).Scan(&count); err != nil {
				t.Fatalf("counting users: %v", err)
			}
			if count != 1 {
				t.Fatalf("users = %d, want 1 (database is not isolated)", count)
			}
		})
	}
}

// Every migration can be undone and redone on a fresh database, and search
// still reads White, Black and Date from a Note's tags afterwards.
func TestMigrationsGoDownAndBackUp(t *testing.T) {
	db := testdb.New(t)
	provider, err := goose.NewProvider(goose.DialectPostgres, db, schema.FS)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.DownTo(t.Context(), 0); err != nil {
		t.Fatalf("down: %v", err)
	}
	if _, err := provider.Up(t.Context()); err != nil {
		t.Fatalf("up again: %v", err)
	}

	var white, black, date sql.NullString
	err = db.QueryRowContext(t.Context(), `
		WITH u AS (INSERT INTO users (email, password_hash, name) VALUES ('ada@example.com', 'x', 'Ada') RETURNING id)
		INSERT INTO notes (user_id, name, tags)
		SELECT id, 'Club night', '[["Event", "Casual"], ["White", "Lovelace, Ada"], ["Black", "?"], ["Date", "1952.03.01"]]' FROM u
		RETURNING white, black, game_date`).Scan(&white, &black, &date)
	if err != nil {
		t.Fatal(err)
	}
	if white.String != "Lovelace, Ada" || black.Valid || date.String != "1952.03.01" {
		t.Fatalf("white, black, date = %v, %v, %v", white, black, date)
	}
}
