package testdb_test

import (
	"fmt"
	"testing"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/testdb"
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
