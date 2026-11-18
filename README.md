# LuChess
A chess website about forming connections between chess games by Luhmann's method of taking notes.

## Running locally

The API (`api/`) and the frontend (`web/`) are separate servers.

```bash
# API
cd api
docker compose up -d --wait   # Postgres 18 on localhost:5433 (5432 is left free for a local install)
cp .env.example .env
echo "JWT_SECRET=$(openssl rand -base64 48)" >> .env   # signs access tokens; the API refuses to start without one
go run .                      # applies any pending migrations, then http://localhost:8080

# Frontend
cd web
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:5173
```

The API only allows browser requests from `FRONTEND_ORIGIN`, so keep the frontend on port 5173 (Vite is pinned to it). The API listens on 8080, or on `PORT` if set.

### Logging in

Login gives the page a 15 minute access token, kept in memory only, and sets a 30 day refresh token in an `HttpOnly` cookie. Reloading the page restores the session from that cookie. The cookie is marked `Secure`; Chromium browsers (Brave, Chrome) accept that on `http://localhost`, but Safari does not, so set `COOKIE_SECURE=false` in `api/.env` if yours refuses it. Because the frontend and API share the host `localhost`, the cookie works across ports.

### Email in development

`MAILER` in `api/.env` chooses how the API sends email, and it refuses to start without it. The example sets `MAILER=console`, so nothing is sent: verification and reset emails are printed to the API's log, and after signing up at http://localhost:5173/signup you copy the link from the terminal running `go run .`. If your `.env` predates this setting, add `MAILER=console` to it.

Production sets `MAILER=smtp` and the `SMTP_` settings listed in `api/.env.example`, for any provider that offers SMTP. It only sends over TLS: port 465 uses TLS from the start, and any other port must offer STARTTLS.

## The frontend's container image

Production serves the site from one origin (docs/adr/0011): Caddy serves the built frontend and passes `/api/` to the API. `web/Dockerfile` builds that image. `VITE_API_URL` is fixed into the bundle, so it is a build argument, and with one origin it is the site's own address; the build fails without it. `VITE_POSTHOG_KEY`, PostHog's project key, is an optional build argument too: with it the site sends analytics through Caddy's `/ingest/` to PostHog, and without it none.

```bash
cd web
docker build -t luchess-web --build-arg VITE_API_URL=https://<the site> .
docker run -p 8080:80 -e API_UPSTREAM=localhost:8081 luchess-web   # API_UPSTREAM defaults to api:8080
```

The container speaks plain HTTP on port 80; Cloudflare terminates HTTPS. The Content-Security-Policy allows `index.html`'s inline theme script by a hash the image build computes (`web/scripts/cspHashes.ts`), so nothing needs updating by hand when the script changes.

## The API's container image

`api/Dockerfile` builds the API into one static binary on distroless, which runs as a non-root user and has no shell. The image has no `.env` (`api/.dockerignore` sends the build only the Go sources and migrations), so every setting in `api/.env.example` comes from the environment. On start it applies any pending migrations, then serves on port 8080.

```bash
cd api
docker build -t luchess-api .
docker buildx build --platform linux/amd64,linux/arm64 -t luchess-api .   # both platforms, e.g. for the Pi
docker run -p 8080:8080 -e DB_URL=postgres://... -e FRONTEND_ORIGIN=https://<the site> \
  -e JWT_SECRET=... -e MAILER=smtp -e SMTP_HOST=... luchess-api
```

## Deploying

`deploy/compose.yaml` runs the whole site on the Pi: Postgres, the API, the web container and `cloudflared`, with the tunnel as the only way in. `docs/deploy.md` covers the first setup, deploying and rolling back by commit SHA, logs, database dumps, and checking the stack locally first.

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
