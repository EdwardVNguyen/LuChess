// Package migrate brings a database's schema up to date with the Goose
// migrations embedded in the binary. The API does it before it serves, and the
// test databases are built the same way, so tests run on the schema the API
// would give itself.
package migrate

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/EdwardVNguyen/LuChess/api/sql/schema"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

// Up applies every pending migration in order and logs each one, or that there
// was nothing to apply.
//
// It holds a Postgres advisory lock while it works, so processes starting
// together cannot apply the same migration twice: the others wait their turn,
// then find the schema current.
//
// Each migration commits on its own. After an error the ones before the failed
// one stay applied, so the schema may be partly migrated and must not be served.
func Up(ctx context.Context, db *sql.DB, logger *log.Logger) error {
	// Goose asks for a held lock every five seconds, for five minutes. Ask every
	// second instead, so a process starting alongside another is not kept waiting.
	locker, err := lock.NewPostgresSessionLocker(lock.WithLockTimeout(1, 300))
	if err != nil {
		return err
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, schema.FS, goose.WithSessionLocker(locker))
	if err != nil {
		return err
	}

	applied, err := provider.Up(ctx)
	var partial *goose.PartialError
	if errors.As(err, &partial) {
		applied = partial.Applied
	}
	for _, m := range applied {
		logger.Printf("Applied migration %s (%s)", m.Source.Path, m.Duration.Round(time.Millisecond))
	}
	if err != nil {
		return fmt.Errorf("migrating the database: %w", err)
	}
	if len(applied) == 0 {
		logger.Print("No pending migrations: the database schema is current")
	}
	return nil
}
