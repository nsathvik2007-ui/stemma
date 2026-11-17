#!/usr/bin/env bash
# Nightly backup of Stemma: the database and the student photos.
#
# Run as root by stemma-backup.timer. Keeps the last KEEP_DAYS days in
# BACKUP_DIR. Those copies sit on the same disk as the originals, so they
# protect against mistakes and corruption, not against losing the server --
# also copy BACKUP_DIR off the machine (deploy/README.md, "Backups").
set -euo pipefail

ENV_FILE="${STEMMA_ENV_FILE:-/srv/stemma/backend/.env}"
BACKUP_DIR="${STEMMA_BACKUP_DIR:-/var/backups/stemma}"
KEEP_DAYS="${STEMMA_BACKUP_KEEP_DAYS:-14}"

# One KEY=value from .env, read rather than sourced: it is python-dotenv's
# format, not a shell script.
env_value() {
  local line
  line=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 || true)
  line=${line#*=}
  line=${line%\"}
  line=${line#\"}
  printf '%s' "$line"
}

DB_NAME=$(env_value DB_NAME); DB_NAME=${DB_NAME:-stemma}
DB_USER=$(env_value DB_USER); DB_USER=${DB_USER:-stemma_app}
DB_PASSWORD=$(env_value DB_PASSWORD)
DB_HOST=$(env_value DB_HOST); DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=$(env_value DB_PORT); DB_PORT=${DB_PORT:-3306}
MEDIA_ROOT=$(env_value DJANGO_MEDIA_ROOT)
MEDIA_ROOT=${MEDIA_ROOT:-$(dirname "$ENV_FILE")/media}

DUMP=$(command -v mariadb-dump || command -v mysqldump) || {
  echo "backup: neither mariadb-dump nor mysqldump is installed" >&2
  exit 1
}

umask 077
mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y-%m-%d_%H%M)

# The password goes in a private options file rather than on the command
# line, where any user on the machine could read it from the process list.
options=$(mktemp)
trap 'rm -f "$options" "$BACKUP_DIR"/*.partial' EXIT
password=${DB_PASSWORD//\\/\\\\}
password=${password//\"/\\\"}
printf '[client]\nuser=%s\npassword="%s"\nhost=%s\nport=%s\n' \
  "$DB_USER" "$password" "$DB_HOST" "$DB_PORT" > "$options"

# MariaDB takes a consistent snapshot (--single-transaction) with only the app
# user's own privileges. MySQL 8+ also wants the server-wide RELOAD privilege
# for that, which the app user should not have, so there the dump read-locks
# Stemma's tables instead: writes wait a few seconds, at 02:30.
# (--set-gtid-purged=OFF is MySQL-only: it keeps the server's replication IDs
# out of the dump, so it restores cleanly onto a different server.)
if "$DUMP" --version | grep -qi mariadb; then
  flavour=(--single-transaction)
else
  flavour=(--lock-tables --set-gtid-purged=OFF)
fi
"$DUMP" --defaults-extra-file="$options" "${flavour[@]}" --no-tablespaces "$DB_NAME" \
  | gzip > "$BACKUP_DIR/db-$stamp.sql.gz.partial"
mv "$BACKUP_DIR/db-$stamp.sql.gz.partial" "$BACKUP_DIR/db-$stamp.sql.gz"

if [ -d "$MEDIA_ROOT" ]; then
  tar -czf "$BACKUP_DIR/media-$stamp.tar.gz.partial" \
    -C "$(dirname "$MEDIA_ROOT")" "$(basename "$MEDIA_ROOT")"
  mv "$BACKUP_DIR/media-$stamp.tar.gz.partial" "$BACKUP_DIR/media-$stamp.tar.gz"
fi

find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*.sql.gz' -o -name 'media-*.tar.gz' \) \
  -mtime +"$KEEP_DAYS" -delete

echo "backup: $DB_NAME and $MEDIA_ROOT saved to $BACKUP_DIR ($stamp)"
