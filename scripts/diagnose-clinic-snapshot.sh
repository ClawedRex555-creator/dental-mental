#!/usr/bin/env bash
# Диагностика зависания «Загрузка данных с сервера» (elanar и др.).
#   cd /opt/emkaro && bash scripts/diagnose-clinic-snapshot.sh elanar
set -euo pipefail
SLUG="${1:-elanar}"
cd "$(cd "$(dirname "$0")/.." && pwd)"

echo "=== clinic_snapshots: ${SLUG} ==="
docker compose exec -T postgres psql -U mis -d dentalcloud -v ON_ERROR_STOP=1 <<SQL
SELECT c.id, c.slug, c.name,
       pg_size_pretty(pg_column_size(s.data)) AS jsonb_size,
       length(s.data::text) AS chars,
       s.updated_at, s.revision,
       jsonb_array_length(COALESCE(s.data->'patients', '[]'::jsonb)) AS patients,
       jsonb_array_length(COALESCE(s.data->'appointments', '[]'::jsonb)) AS appointments,
       jsonb_array_length(COALESCE(s.data->'workActs', '[]'::jsonb)) AS work_acts,
       jsonb_array_length(COALESCE(s.data->'patientFiles', '[]'::jsonb)) AS patient_files,
       jsonb_array_length(COALESCE(s.data->'medicalRecords', '[]'::jsonb)) AS medical_records
FROM clinics c
LEFT JOIN clinic_snapshots s ON s.clinic_id = c.id
WHERE c.slug = '${SLUG}';

SELECT u.login, u.role, u.status
FROM auth_users u
JOIN clinics c ON c.id = u.clinic_id
WHERE c.slug = '${SLUG}'
ORDER BY u.role, u.login;
SQL
