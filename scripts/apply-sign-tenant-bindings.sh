#!/usr/bin/env bash
# Apply EMKARO_SIGN_TENANT_MAP JSON to MIS .env + clinics.emkaro_sign_config.
# Run on MIS VPS (/opt/emkaro):
#   bash scripts/apply-sign-tenant-bindings.sh '{"demo":{"organizationId":"...","clinicId":"..."},"elanar":{...}}'
# Or pipe:
#   echo '{...}' | bash scripts/apply-sign-tenant-bindings.sh
set -euo pipefail

ROOT="${MIS_ROOT:-/opt/emkaro}"
cd "$ROOT"

if [[ $# -ge 1 ]]; then
  MAP_JSON="$1"
else
  MAP_JSON="$(cat)"
fi

if [[ -z "$MAP_JSON" ]]; then
  echo "ERROR: pass tenant map JSON"
  exit 1
fi

python3 - <<'PY' "$MAP_JSON"
import json, sys
raw = sys.argv[1]
data = json.loads(raw)
if not isinstance(data, dict) or not data:
    raise SystemExit("ERROR: expected non-empty JSON object")
for slug, v in data.items():
    if not isinstance(v, dict) or not v.get("organizationId") or not v.get("clinicId"):
        raise SystemExit(f"ERROR: bad entry for {slug}")
print("OK parsed", len(data), "clinics")
PY

# Merge into .env (replace whole map — pass full map including tstom)
sed -i '/^EMKARO_SIGN_TENANT_MAP=/d' .env
# Escape for .env single line
printf 'EMKARO_SIGN_TENANT_MAP=%s\n' "$MAP_JSON" >> .env

# Upsert DB config per clinic
python3 - <<'PY' "$MAP_JSON" | docker compose exec -T postgres psql -U mis -d dentalcloud -v ON_ERROR_STOP=1
import json, sys
data = json.loads(sys.argv[1])
print("BEGIN;")
for slug, v in data.items():
    org = v["organizationId"].replace("'", "''")
    clinic = v["clinicId"].replace("'", "''")
    s = slug.lower().replace("'", "''")
    print(
        "UPDATE clinics SET emkaro_sign_config = "
        f"jsonb_build_object('organizationId','{org}','clinicId','{clinic}') "
        f"WHERE lower(slug)='{s}';"
    )
print("SELECT slug, emkaro_sign_config FROM clinics ORDER BY slug;")
print("COMMIT;")
PY

# Ensure Sign URL present
grep -q '^EMKARO_SIGN_API_URL=' .env || echo 'EMKARO_SIGN_API_URL=https://sign.emkaro.ru' >> .env
sed -i 's|^EMKARO_SIGN_API_URL=.*|EMKARO_SIGN_API_URL=https://sign.emkaro.ru|' .env

docker compose up -d --force-recreate app
sleep 2
echo "TENANT_MAP in container:"
docker compose exec -T app printenv EMKARO_SIGN_TENANT_MAP || true
echo "Done."
