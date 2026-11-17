#!/usr/bin/env bash
# Backs up the database (#138): dumps it from the db container, checks that
# the dump can be read back, and copies it to the R2 bucket. It fails a
# backup that worked but looks wrong (#157): an empty users or notes table,
# or a dump under half the size of the newest one in the bucket. It never
# deletes anything: R2's lifecycle rule expires old dumps, and its lock rule
# keeps them from being deleted before then, even with this script's token.
# Healthchecks hears when it starts and how it ended, with the output, so a
# failed or missing backup is emailed. The systemd timer in systemd/ runs it
# nightly (docs/deploy.md).
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
  local name var bucket counts users notes size newest newest_size
  for var in BACKUP_HEALTHCHECK_URL R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    if [ -z "$(setting "$var")" ]; then
      echo "set $var in $env_file" >&2
      return 1
    fi
  done
  bucket=$(setting R2_BUCKET)

  # A dump of a wiped database reads back fine, so check that it holds
  # something first.
  counts=$(compose exec -T db psql -U luchess -d luchess -tAc \
    'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM notes)')
  IFS='|' read -r users notes <<< "$counts"
  echo "users: $users, notes: $notes"
  if [ "$users" -eq 0 ] || [ "$notes" -eq 0 ]; then
    echo "the users or notes table is empty, so the database was not backed up" >&2
    return 1
  fi

  name=luchess-$(date -u +%Y-%m-%dT%H%M%SZ).dump

  # The custom format is compressed, and pg_restore can restore all of it or
  # only some tables.
  compose exec -T db pg_dump -U luchess -d luchess -Fc > "$work/$name"
  compose exec -T db pg_restore --list < "$work/$name" > /dev/null
  size=$(($(wc -c < "$work/$name")))
  echo "dumped $name ($size bytes)"

  # The names sort by the time they were taken, so the last is the newest.
  newest=$(compose run --rm -T --quiet-pull backup \
    lsf "r2:$bucket" --files-only --include 'luchess-*.dump' --format sp | sort -t ';' -k 2 | tail -n 1)

  compose run --rm -T --quiet-pull -v "$work:/dumps:ro" backup \
    copyto "/dumps/$name" "r2:$bucket/$name"
  echo "copied it to r2:$bucket"

  # Checked after the copy, so the bucket still gets the dump if the data
  # really did shrink: the next night compares against this one.
  if [ -z "$newest" ]; then
    echo "no earlier dump in the bucket to compare with"
    return 0
  fi
  newest_size=${newest%%;*}
  echo "newest earlier dump: ${newest#*;} ($newest_size bytes)"
  if [ $((size * 2)) -lt "$newest_size" ]; then
    echo "$name is under half the size of ${newest#*;}" >&2
    return 1
  fi
}

ping "$healthcheck_url/start"
backup > "$work/log" 2>&1
