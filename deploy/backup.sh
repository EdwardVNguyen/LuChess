#!/usr/bin/env bash
# Backs up the database (#138): dumps it from the db container, checks that
# the dump can be read back, copies it to the R2 bucket, and deletes the
# bucket's dumps older than BACKUP_KEEP_DAYS. Healthchecks hears when it
# starts and how it ended, with the output, so a failed or missing backup is
# emailed. The systemd timer in systemd/ runs it nightly (docs/deploy.md).
#
# Settings come from .env next to this file, or from the file ENV_FILE names.
set -euo pipefail

cd "$(dirname "$0")"
env_file=${ENV_FILE:-.env}

# Reads one setting from the env file without running it as shell, since
# values like SMTP_FROM's are not shell-safe.
setting() { sed -n "s/^$1=//p" "$env_file" | tail -n 1; }

compose() { docker compose --env-file "$env_file" "$@"; }

ping() {
  [ -n "$healthcheck_url" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$@" || echo "could not ping Healthchecks" >&2
}

healthcheck_url=$(setting BACKUP_HEALTHCHECK_URL)
work=$(mktemp -d)
# The script's own output, for finish: when set -e exits from inside
# `backup > log`, the trap still writes to the log.
exec 3>&1 4>&2

finish() {
  local status=$?
  exec 1>&3 2>&4
  cat "$work/log" 2>/dev/null || true
  # The exit status as the path marks the check failed unless it is 0.
  ping --data-binary "@$work/log" "$healthcheck_url/$status"
  rm -rf "$work"
}
trap finish EXIT

backup() {
  local name var bucket keep_days
  for var in BACKUP_HEALTHCHECK_URL R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY BACKUP_KEEP_DAYS; do
    if [ -z "$(setting "$var")" ]; then
      echo "set $var in $env_file" >&2
      return 1
    fi
  done
  bucket=$(setting R2_BUCKET)
  keep_days=$(setting BACKUP_KEEP_DAYS)

  name=luchess-$(date -u +%Y-%m-%dT%H%M%SZ).dump

  # The custom format is compressed, and pg_restore can restore all of it or
  # only some tables.
  compose exec -T db pg_dump -U luchess -d luchess -Fc > "$work/$name"
  compose exec -T db pg_restore --list < "$work/$name" > /dev/null
  echo "dumped $name ($(du -h "$work/$name" | cut -f1))"

  compose run --rm -T --quiet-pull -v "$work:/dumps:ro" backup \
    copyto "/dumps/$name" "r2:$bucket/$name"
  echo "copied it to r2:$bucket"

  # Only after a dump has reached the bucket, so failed nights never leave it
  # empty.
  compose run --rm -T --quiet-pull backup \
    delete "r2:$bucket" --include 'luchess-*.dump' --min-age "${keep_days}d" -v
}

ping "$healthcheck_url/start"
backup > "$work/log" 2>&1
