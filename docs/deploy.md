# Deploying LuChess

The site runs on the owner's Raspberry Pi 5 from `deploy/compose.yaml` (docs/adr/0011). It has four services:

- `db`: Postgres 18, its data in the `pgdata` volume
- `api`: the API, which applies pending migrations and then serves
- `web`: Caddy, serving the frontend and passing `/api/` to the API
- `cloudflared`: the Cloudflare Tunnel, the only way in

No service publishes a port. CI builds both images for arm64 and publishes them to GHCR: `ghcr.io/edwardvnguyen/luchess-api` and `ghcr.io/edwardvnguyen/luchess-web`, each tagged `latest` and with the full commit SHA. `IMAGE_TAG` in `deploy/.env` picks the commit that runs, so deploying and rolling back are the same step.

Run every command below from the `deploy` directory.

## First setup on the Pi

1. **Install Docker.** On 64-bit Raspberry Pi OS, install Docker Engine and the Compose plugin from Docker's apt repository ([instructions for Debian](https://docs.docker.com/engine/install/debian/)). Then let your user run it, and log in again:

   ```bash
   sudo usermod -aG docker "$USER"
   ```

   Docker starts at boot, and `restart: unless-stopped` brings the site back after a reboot or a crash.

2. **Get the deploy files.** Clone the repository. Only `deploy/` is used, and `git pull` picks up later changes to it:

   ```bash
   git clone https://github.com/EdwardVNguyen/LuChess.git ~/luchess
   cd ~/luchess/deploy
   ```

3. **Let Docker pull the images.** GHCR packages are private unless they are made public. If they are private, create a GitHub personal access token (classic) with only the `read:packages` scope, and log in once:

   ```bash
   docker login ghcr.io -u EdwardVNguyen   # paste the token as the password
   ```

4. **Create the tunnel.** In Cloudflare's dashboard, go to Zero Trust, then Networks > Tunnels, and create a Cloudflared tunnel. On the install step, choose Docker. Its command ends in `--token <token>`: that token is `TUNNEL_TOKEN`. Skip the install itself, because Compose runs `cloudflared`. Then add one public hostname, the site's domain, with service type `HTTP` and URL `web:80`. Leave HTTPS on at Cloudflare. Don't add a cache rule that covers `/api/` (docs/adr/0011).

5. **Write the environment file.** Make it readable by its owner alone:

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

   Fill in every setting, as `.env.example` describes. `ls -l .env` should show `-rw-------`. The file holds every secret the site has, so never commit it or copy it anywhere else. Git already ignores it.

6. **Start it.**

   ```bash
   docker compose pull
   docker compose up -d
   docker compose ps
   ```

   All four services should show `Up`, and `db` should show `(healthy)`. Then open the site, sign up, and check that the verification email arrives.

## Deploying a new commit

CI publishes images for every push to `main` that passes the tests. To deploy one, set `IMAGE_TAG` to that commit's full SHA, then pull and restart:

```bash
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<full SHA>/" .env
docker compose pull
docker compose up -d
```

Compose recreates only the containers whose image changed. The API applies any new migrations before it serves. If the commit also changed `deploy/compose.yaml`, run `git pull` first.

## Rolling back

Rolling back is the same command with an earlier SHA:

```bash
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<earlier SHA>/" .env
docker compose pull
docker compose up -d
```

Migrations only go forward. Rolling back past a commit that added a migration (a new file in `api/sql/schema`) leaves the database on the newer schema, which the older API may not handle. So take a dump before you deploy a commit with a migration (see below). To undo a migration, restore that dump.

## Reading the logs

```bash
docker compose ps                       # what is running, and since when
docker compose logs -f api              # follow the API's log
docker compose logs --since 1h web      # Caddy's log for the last hour
docker compose logs cloudflared         # whether the tunnel is connected
```

Each service keeps its log in Docker's `local` format, rotated so it cannot fill the disk.

## Taking a database dump and copying it off the Pi

```bash
docker compose exec -T db pg_dump -U luchess -d luchess -Fc > luchess-$(date +%F).dump
```

Then, from another machine, copy it off the Pi and delete the Pi's copy:

```bash
scp <user>@<pi>:luchess/deploy/luchess-<date>.dump .
ssh <user>@<pi> rm luchess/deploy/luchess-<date>.dump
```

The dump holds every user's email address and password hash, so keep it somewhere private. To restore one, stop the API first:

```bash
docker compose stop api
docker compose exec -T db pg_restore -U luchess -d luchess --clean --if-exists < luchess-<date>.dump
docker compose start api
```

Nightly backups are a separate task (#138).

## Checking the stack locally

Before changing `compose.yaml`, run the stack on your own machine. This check uses images built from your checkout and leaves out `cloudflared`. `compose.local.yaml` publishes `web` on http://localhost (port 80). `local.env` sets `FRONTEND_ORIGIN` to `http://localhost`, `COOKIE_SECURE=false` and `MAILER=console`, values that are right for this check only. It doesn't read `.env`.

```bash
docker compose --env-file local.env -f compose.yaml -f compose.local.yaml up -d --build
```

1. Open http://localhost/signup and sign up.
2. Find the verification link in the API's log, and open it:

   ```bash
   docker compose --env-file local.env -f compose.yaml -f compose.local.yaml logs api | grep verify-email
   ```

3. Log in, and create a Note.
4. Restart the stack from scratch, but keep the volume:

   ```bash
   docker compose --env-file local.env -f compose.yaml -f compose.local.yaml down
   docker compose --env-file local.env -f compose.yaml -f compose.local.yaml up -d
   ```

5. Reload the page. You should still be logged in, and the Note should still be there.

When you're done, `down -v` removes the containers and the local database.
