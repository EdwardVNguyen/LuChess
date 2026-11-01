# ChessNotes
A chess website about forming connections between chess games by Luhmann's method of taking notes.

## Running locally

The API (`api/`) and the frontend (`web/`) are separate servers.

```bash
# API: copy the example env file, then run
cd api
cp .env.example .env
go run .          # http://localhost:8080
go test ./...

# Frontend
cd web
cp .env.example .env.local
npm install
npm run dev       # http://localhost:5173
npm test
```

The API only allows browser requests from `FRONTEND_ORIGIN`, so keep the frontend on port 5173 (Vite is pinned to it).
