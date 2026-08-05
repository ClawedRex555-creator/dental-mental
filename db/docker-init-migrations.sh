#!/bin/bash
# Runs after 01-schema.sql on first Postgres container init.
# Applies db/migrations/*.sql in sorted order into schema_migrations ledger.
set -euo pipefail

MIGRATIONS_DIR="/docker-entrypoint-initdb.d/migrations"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "docker-init-migrations: no migrations dir, skip"
  exit 0
fi

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))
unset IFS

for file in "${sorted[@]}"; do
  base="$(basename "$file")"
  applied="$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc \
    "SELECT 1 FROM schema_migrations WHERE filename = '${base}'" | tr -d '[:space:]')"
  if [ "$applied" = "1" ]; then
    echo "docker-init-migrations: skip $base"
    continue
  fi
  echo "docker-init-migrations: apply $base"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c \
    "INSERT INTO schema_migrations (filename) VALUES ('${base}')"
done

echo "docker-init-migrations: done"
