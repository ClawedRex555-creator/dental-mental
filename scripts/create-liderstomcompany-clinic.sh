#!/usr/bin/env bash
# Создаёт клинику «ЛИДЕР СТОМ КОМПАНИ» (slug liderstomcompany) в PostgreSQL.
#
#   export LIDERSTOM_OWNER_PASSWORD='YourStrongPass123!'
#   export LIDERSTOM_OWNER_EMAIL='owner@liderstomcompany.ru'   # опционально
#   bash scripts/create-liderstomcompany-clinic.sh
#
# На сервере (/opt/emkaro):
#   export LIDERSTOM_OWNER_PASSWORD='...'
#   docker compose exec -T app node scripts/create-clinic.mjs \
#     --slug liderstomcompany --name "ЛИДЕР СТОМ КОМПАНИ" \
#     --email "$LIDERSTOM_OWNER_EMAIL" --password "$LIDERSTOM_OWNER_PASSWORD" \
#     --owner-name "Владелец ЛИДЕР СТОМ КОМПАНИ"
#   docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SLUG="liderstomcompany"
NAME="${LIDERSTOM_CLINIC_NAME:-ЛИДЕР СТОМ КОМПАНИ}"
EMAIL="${LIDERSTOM_OWNER_EMAIL:-admin@liderstomcompany.ru}"
OWNER_NAME="${LIDERSTOM_OWNER_NAME:-Владелец клиники}"
PASSWORD="${LIDERSTOM_OWNER_PASSWORD:-}"

if [[ -z "$PASSWORD" ]]; then
  echo "Задайте пароль владельца (мин. 8 символов):"
  echo "  export LIDERSTOM_OWNER_PASSWORD='YourStrongPass123!'"
  exit 1
fi

ARGS=(
  --slug "$SLUG"
  --name "$NAME"
  --email "$EMAIL"
  --password "$PASSWORD"
  --owner-name "$OWNER_NAME"
)

run_in_app() {
  local compose=(docker compose)
  if [[ -f docker-compose.quick.yml ]] && docker compose -f docker-compose.quick.yml ps 2>/dev/null | grep -qE 'app.*Up'; then
    compose=(docker compose -f docker-compose.quick.yml)
  elif ! docker compose ps 2>/dev/null | grep -qE 'app.*Up'; then
    return 1
  fi
  "${compose[@]}" exec -T app node scripts/create-clinic.mjs "${ARGS[@]}"
}

if run_in_app; then
  exit 0
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Контейнер app не запущен и DATABASE_URL не задан."
  echo "Локально: docker compose up -d && export LIDERSTOM_OWNER_PASSWORD=... && bash $0"
  echo "Или: DATABASE_URL=postgresql://... npm run create-clinic -- ${ARGS[*]}"
  exit 1
fi

node scripts/create-clinic.mjs "${ARGS[@]}"
