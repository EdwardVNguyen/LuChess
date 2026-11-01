# ChessNotes
A chess website about forming connections between chess games by Luhmann's method of taking notes.

## Running locally

The API (`api/`) and the frontend (`web/`) are separate servers.

```bash
# API
cd api
docker compose up -d --wait   # Postgres 18 on localhost:5433 (5432 is left free for a local install)
cp .env.example .env
goose -dir sql/schema postgres "$(grep ^DB_URL .env | cut -d= -f2-)" up   # apply migrations
go run .                      # http://localhost:8080

# Frontend
cd web
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:5173
```

The API only allows browser requests from `FRONTEND_ORIGIN`, so keep the frontend on port 5173 (Vite is pinned to it). The API listens on 8080, or on `PORT` if set.

### Email in development

The API never sends real email locally. Verification emails are printed to the API's log, so after signing up at http://localhost:5173/signup, copy the link from the terminal running `go run .`. Production will use a real provider behind the same `Mailer` interface.

## Tests

```bash
# API: needs the Postgres container above to be running
cd api
go test ./...

# Frontend
cd web
npm test
```

API tests run against a real Postgres, with nothing in the data layer mocked. `internal/testdb` builds a migrated template database once (named after a hash of the migrations, so it rebuilds when they change) and gives every test its own copy, which is dropped afterwards. Tests can therefore run in parallel and exercise real constraints and cascades.

To use a different server, set `TEST_DB_URL` to a connection URL for any database on it, such as `postgres://user:pass@host:5432/postgres?sslmode=disable`. It needs permission to create databases.
