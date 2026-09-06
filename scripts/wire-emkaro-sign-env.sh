#!/usr/bin/env bash
# Apply Emkaro Sign env on MIS host (/opt/emkaro).
# Usage:
#   EMKARO_SIGN_API_KEY=… EMKARO_SIGN_WEBHOOK_SECRET=… \
#   EMKARO_SIGN_ORG_ID=… EMKARO_SIGN_CLINIC_ID=… \
#   bash scripts/wire-emkaro-sign-env.sh
set -euo pipefail

ROOT="${MIS_ROOT:-/opt/emkaro}"
ENV_FILE="${ROOT}/.env"
MIS_SLUG="${MIS_SLUG:-tstom}"
API_URL="${EMKARO_SIGN_API_URL:-https://sign.emkaro.ru}"
API_KEY="${EMKARO_SIGN_API_KEY:?set EMKARO_SIGN_API_KEY}"
WEBHOOK="${EMKARO_SIGN_WEBHOOK_SECRET:?set EMKARO_SIGN_WEBHOOK_SECRET}"
ORG_ID="${EMKARO_SIGN_ORG_ID:?set EMKARO_SIGN_ORG_ID}"
CLINIC_ID="${EMKARO_SIGN_CLINIC_ID:?set EMKARO_SIGN_CLINIC_ID}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE"
  exit 1
fi

TENANT_MAP=$(printf '{"%s":{"organizationId":"%s","clinicId":"%s"}}' "$MIS_SLUG" "$ORG_ID" "$CLINIC_ID")

upsert_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

upsert_env DOCUMENT_SIGN_PROVIDER emkaro_sign
upsert_env EMKARO_SIGN_API_URL "$API_URL"
upsert_env EMKARO_SIGN_API_KEY "$API_KEY"
upsert_env EMKARO_SIGN_WEBHOOK_SECRET "$WEBHOOK"
# JSON contains quotes — write carefully
if grep -q '^EMKARO_SIGN_TENANT_MAP=' "$ENV_FILE"; then
  sed -i "s|^EMKARO_SIGN_TENANT_MAP=.*|EMKARO_SIGN_TENANT_MAP=${TENANT_MAP}|" "$ENV_FILE"
else
  printf '\nEMKARO_SIGN_TENANT_MAP=%s\n' "$TENANT_MAP" >>"$ENV_FILE"
fi

# Drop mock in production if present
sed -i '/^EMKARO_SIGN_MOCK=/d' "$ENV_FILE" || true

cd "$ROOT"
# Prefer compose service name used on this host
if docker compose ps --services 2>/dev/null | grep -qx postgres; then
  PG_SVC=postgres
elif docker compose ps --services 2>/dev/null | grep -qx db; then
  PG_SVC=db
else
  PG_SVC=
fi

if [[ -n "$PG_SVC" ]]; then
  docker compose exec -T "$PG_SVC" psql -U emkaro -d dentalcloud -v ON_ERROR_STOP=1 -c \
    "UPDATE clinics
     SET emkaro_sign_config = jsonb_build_object(
       'organizationId', '${ORG_ID}',
       'clinicId', '${CLINIC_ID}'
     )
     WHERE lower(slug) = lower('${MIS_SLUG}');"
fi

docker compose up -d app --force-recreate
sleep 3
curl -sf "https://${MIS_SLUG}.emkaro.ru/api/health" 2>/dev/null || curl -sf http://127.0.0.1:3000/api/health || true
echo
echo "Wired Sign for slug=${MIS_SLUG} → ${API_URL}"
