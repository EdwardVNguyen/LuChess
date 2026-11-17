# Deploying LuChess

The site runs on the owner's Raspberry Pi 5 from `deploy/compose.yaml` (docs/adr/0011). It has four services:

- `db`: Postgres 18, its data in the `pgdata` volume
- `api`: the API, which applies pending migrations and then serves
- `web`: Caddy, serving the frontend and passing `/api/` to the API
- `cloudflared`: the Cloudflare Tunnel, the only way in

`backup` (rclone) runs only during the nightly backup, below.

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

## Nightly backups

`backup.sh` dumps the database, checks that the dump can be read back, and copies it to a Cloudflare R2 bucket with the `backup` service (rclone). It never deletes anything: R2 expires each dump after 30 days, and a lock rule keeps any dump from being deleted before then, even with the script's own token. So whoever gets into the Pi can't empty the bucket. It tells [Healthchecks](https://healthchecks.io) when it starts and how it ended, and Healthchecks emails you when a backup fails or none arrives. A systemd timer runs it every night at about 03:30.

A dump can be read back and still be wrong, for example a dump of a database that was wiped. So a backup also fails when:

- the `users` or `notes` table has no rows. It checks this before dumping, and takes no dump.
- the dump is under half the size of the newest dump already in the bucket. It checks this after copying the dump, so the bucket still gets it: if the data really did shrink, that night's check goes red once, and the next night compares against the smaller dump. The first backup into an empty bucket has nothing to compare with, and passes.

It prints both counts and both sizes, so they appear in Healthchecks' ping body, and in the email when one of these fails.

Dumps are not encrypted on the Pi. The R2 token works on the backup bucket alone, and R2 encrypts every object at rest. That is accepted for v1, though the dumps hold every user's email address and password hash, so anyone with access to the bucket can read them.

### Setting them up

1. **Make the bucket.** In Cloudflare's dashboard, go to R2 and create a bucket, for example `luchess-backups`. Then, under Manage API tokens, create a token with **Object Read & Write** on that bucket alone. Copy its access key ID and secret access key, and the account ID from R2's overview page.

   Then, in the bucket's settings, add two rules, both for the prefix `luchess-`:

   - Under **Object lifecycle rules**, a rule that deletes objects 30 days after they were uploaded. This is the retention: 30 days, no monthly copies.
   - Under **Bucket lock rules**, a rule that keeps objects for 30 days (retention by age). Nothing can delete a dump before then, not even the Pi's token.

   With both at 30 days, a dump can be deleted once it expires, and no earlier.

2. **Make the check.** On healthchecks.io, add a check with a period of 1 day and a grace time of 2 hours, and copy its ping URL. Its email integration is on by default.

3. **Fill in the backup settings** in `.env`: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `BACKUP_HEALTHCHECK_URL`, as `.env.example` describes.

4. **Take one backup by hand**, and check that it worked:

   ```bash
   ./backup.sh
   ```

   It prints the row counts, the dump's name and size, `copied it to r2:<bucket>`, and `no earlier dump in the bucket to compare with`. The dump should be in the bucket, and the check on Healthchecks should be green. On a new site, sign up and create a Note first: with no users or no Notes, the backup fails.

5. **Install the timer.** The units in `systemd/` run as your user, so they can use Docker. They expect the clone at `~/luchess`. Lingering starts your units at boot without a login:

   ```bash
   mkdir -p ~/.config/systemd/user
   cp systemd/luchess-backup.* ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now luchess-backup.timer
   sudo loginctl enable-linger "$USER"
   systemctl --user list-timers                 # the next run
   journalctl --user -u luchess-backup          # what past runs printed
   ```

   If the Pi is off at 03:30, the backup runs when it is next on.

### Restoring a backup

Get a dump from the bucket. The `backup` service can list and fetch them:

```bash
docker compose run --rm backup lsl r2:luchess-backups
docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD:/restore" backup copyto r2:luchess-backups/<name>.dump /restore/<name>.dump
```

To restore it over the running site's database, stop the API first:

```bash
docker compose stop api
docker compose exec -T db pg_restore -U luchess -d luchess --clean --if-exists < <name>.dump
docker compose start api
```

To restore it onto a new Pi, do steps 1 to 5 of the first setup, then start only the database, restore, and start the rest:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U luchess -d luchess < <name>.dump
docker compose up -d
```

The API applies any migrations newer than the dump when it starts. Then delete the local copy of the dump.

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
