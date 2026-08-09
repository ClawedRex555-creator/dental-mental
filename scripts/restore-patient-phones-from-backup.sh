#!/bin/bash
# Хирургическое восстановление телефонов (и пустого PHI) пациентов из SQL-бэкапа
# в ЖИВУЮ БД — без полного DROP DATABASE.
#
# На сервере:
#   cd /opt/emkaro
#   bash scripts/inspect-backup-patients.sh
#   bash scripts/restore-patient-phones-from-backup.sh backups/dentalcloud-YYYYMMDD-HHMMSS.sql
#   bash scripts/restore-patient-phones-from-backup.sh backups/….sql --apply
#
# Без --apply только показывает, сколько номеров можно вернуть (dry-run).
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
DUMP=""
APPLY=0
TMP_DB="dentalcloud_phone_restore"
PHI_CSV="/tmp/emkaro-patient-phi-from-backup.csv"

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help)
      echo "Usage: $0 <backup.sql> [--apply]"
      exit 0
      ;;
    *)
      if [ -z "$DUMP" ]; then DUMP="$arg"; else
        echo "Лишний аргумент: $arg"
        exit 1
      fi
      ;;
  esac
done

if [ -z "$DUMP" ]; then
  echo "Укажите файл дампа:"
  echo "  bash scripts/restore-patient-phones-from-backup.sh backups/dentalcloud-….sql"
  echo "  bash scripts/restore-patient-phones-from-backup.sh backups/….sql --apply"
  exit 1
fi

cd "$ROOT"

if [ ! -f "$DUMP" ]; then
  echo "Файл не найден: $DUMP"
  exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
  echo "docker-compose.yml не найден в $(pwd)"
  exit 1
fi

psql_live() {
  docker compose exec -T postgres psql -U mis -d dentalcloud -v ON_ERROR_STOP=1 "$@"
}

psql_tmp() {
  docker compose exec -T postgres psql -U mis -d "$TMP_DB" -v ON_ERROR_STOP=1 "$@"
}

psql_admin() {
  docker compose exec -T postgres psql -U mis -d postgres -v ON_ERROR_STOP=1 "$@"
}

cleanup_tmp() {
  psql_admin -c "DROP DATABASE IF EXISTS $TMP_DB;" >/dev/null 2>&1 || true
  rm -f "$PHI_CSV"
}

echo "=== Восстановление телефонов из: $DUMP ==="
echo "Режим: $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)"
echo ""

echo ">>> Страховочный дамп текущего состояния..."
bash scripts/backup-db.sh "$ROOT" "pre-phone-restore" >/dev/null
echo "    $(cat backups/.last-backup 2>/dev/null || true)"

echo ">>> Готовим временную БД $TMP_DB..."
cleanup_tmp
psql_admin <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$TMP_DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $TMP_DB;
CREATE DATABASE $TMP_DB OWNER mis;
SQL

echo ">>> Загружаем дамп во временную БД (это может занять минуту)..."
if ! docker compose exec -T postgres psql -U mis -d "$TMP_DB" -v ON_ERROR_STOP=1 < "$DUMP" \
  >/tmp/emkaro-phone-restore-load.log 2>&1; then
  echo "Ошибка загрузки дампа. Хвост лога:"
  tail -40 /tmp/emkaro-phone-restore-load.log
  cleanup_tmp
  exit 1
fi

echo ">>> Выгружаем PHI пациентов из бэкапа..."
psql_tmp -c "\copy (
  SELECT
    cs.clinic_id::text,
    p->>'id' AS patient_id,
    COALESCE(p->>'phone', '') AS phone,
    COALESCE(p->>'email', '') AS email,
    COALESCE(p->>'snils', '') AS snils,
    COALESCE(p->>'passportSeries', '') AS passport_series,
    COALESCE(p->>'passportNumber', '') AS passport_number,
    COALESCE(p->>'address', '') AS address,
    COALESCE(p->>'birthCertificateSeries', '') AS birth_cert_series,
    COALESCE(p->>'birthCertificateNumber', '') AS birth_cert_number,
    COALESCE(p->>'representativePassportSeries', '') AS repr_passport_series,
    COALESCE(p->>'representativePassportNumber', '') AS repr_passport_number
  FROM clinic_snapshots cs
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cs.data->'patients', '[]'::jsonb)) p
  WHERE COALESCE(NULLIF(trim(p->>'phone'), ''), '') <> ''
     OR COALESCE(NULLIF(trim(p->>'email'), ''), '') <> ''
     OR COALESCE(NULLIF(trim(p->>'snils'), ''), '') <> ''
     OR COALESCE(NULLIF(trim(p->>'address'), ''), '') <> ''
) TO STDOUT WITH CSV" > "$PHI_CSV"

PHI_ROWS=$(wc -l < "$PHI_CSV" | tr -d ' ')
echo "    строк PHI в бэкапе: $PHI_ROWS"

if [ "${PHI_ROWS:-0}" = "0" ]; then
  echo "В этом бэкапе нет пациентов с заполненным PHI — телефоны уже были пустые."
  echo "Возьмите более ранний файл из backups/."
  cleanup_tmp
  exit 1
fi

# COPY FROM STDIN needs file inside container OR pipe via docker exec -i
echo ">>> Загружаем PHI во временную таблицу живой БД..."
psql_live <<'SQL'
DROP TABLE IF EXISTS tmp_patient_phi_restore;
CREATE TABLE tmp_patient_phi_restore (
  clinic_id text NOT NULL,
  patient_id text NOT NULL,
  phone text,
  email text,
  snils text,
  passport_series text,
  passport_number text,
  address text,
  birth_cert_series text,
  birth_cert_number text,
  repr_passport_series text,
  repr_passport_number text
);
SQL

docker compose exec -T postgres psql -U mis -d dentalcloud -v ON_ERROR_STOP=1 \
  -c "\copy tmp_patient_phi_restore FROM STDIN WITH CSV" < "$PHI_CSV"

echo ">>> Текущее состояние живой БД:"
psql_live -c "
SELECT c.slug,
       COUNT(*) AS patients,
       COUNT(*) FILTER (
         WHERE COALESCE(NULLIF(trim(p->>'phone'), ''), '') <> ''
       ) AS with_phone,
       COUNT(*) FILTER (
         WHERE COALESCE(NULLIF(trim(p->>'phone'), ''), '') = ''
       ) AS empty_phone
FROM clinic_snapshots cs
JOIN clinics c ON c.id = cs.clinic_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cs.data->'patients', '[]'::jsonb)) p
GROUP BY c.slug
ORDER BY c.slug;
"

echo ">>> Сколько телефонов можно вернуть из бэкапа (по id пациента):"
psql_live -c "
SELECT c.slug,
       COUNT(*) AS restorable_phones
FROM clinic_snapshots live
JOIN clinics c ON c.id = live.clinic_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(live.data->'patients', '[]'::jsonb)) live_p
JOIN tmp_patient_phi_restore bak
  ON bak.clinic_id = live.clinic_id::text
 AND bak.patient_id = live_p->>'id'
WHERE COALESCE(NULLIF(trim(live_p->>'phone'), ''), '') = ''
  AND COALESCE(NULLIF(trim(bak.phone), ''), '') <> ''
GROUP BY c.slug
ORDER BY c.slug;
"

if [ "$APPLY" != 1 ]; then
  echo ""
  echo "Dry-run. Чтобы записать в живую БД:"
  echo "  bash scripts/restore-patient-phones-from-backup.sh $DUMP --apply"
  psql_live -c "DROP TABLE IF EXISTS tmp_patient_phi_restore;"
  cleanup_tmp
  exit 0
fi

echo ">>> Применяем восстановление PHI…"
psql_live <<'SQL'
CREATE OR REPLACE FUNCTION pg_temp.empty_phi(v text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(trim(v), ''), '') = '';
$$;

CREATE OR REPLACE FUNCTION pg_temp.merge_patient_phi(live_p jsonb, bak tmp_patient_phi_restore)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  out_p jsonb := live_p;
BEGIN
  IF bak.patient_id IS NULL THEN
    RETURN live_p;
  END IF;
  IF pg_temp.empty_phi(live_p->>'phone') AND NOT pg_temp.empty_phi(bak.phone) THEN
    out_p := jsonb_set(out_p, '{phone}', to_jsonb(bak.phone), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'email') AND NOT pg_temp.empty_phi(bak.email) THEN
    out_p := jsonb_set(out_p, '{email}', to_jsonb(bak.email), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'snils') AND NOT pg_temp.empty_phi(bak.snils) THEN
    out_p := jsonb_set(out_p, '{snils}', to_jsonb(bak.snils), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'passportSeries') AND NOT pg_temp.empty_phi(bak.passport_series) THEN
    out_p := jsonb_set(out_p, '{passportSeries}', to_jsonb(bak.passport_series), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'passportNumber') AND NOT pg_temp.empty_phi(bak.passport_number) THEN
    out_p := jsonb_set(out_p, '{passportNumber}', to_jsonb(bak.passport_number), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'address') AND NOT pg_temp.empty_phi(bak.address) THEN
    out_p := jsonb_set(out_p, '{address}', to_jsonb(bak.address), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'birthCertificateSeries') AND NOT pg_temp.empty_phi(bak.birth_cert_series) THEN
    out_p := jsonb_set(out_p, '{birthCertificateSeries}', to_jsonb(bak.birth_cert_series), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'birthCertificateNumber') AND NOT pg_temp.empty_phi(bak.birth_cert_number) THEN
    out_p := jsonb_set(out_p, '{birthCertificateNumber}', to_jsonb(bak.birth_cert_number), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'representativePassportSeries') AND NOT pg_temp.empty_phi(bak.repr_passport_series) THEN
    out_p := jsonb_set(out_p, '{representativePassportSeries}', to_jsonb(bak.repr_passport_series), true);
  END IF;
  IF pg_temp.empty_phi(live_p->>'representativePassportNumber') AND NOT pg_temp.empty_phi(bak.repr_passport_number) THEN
    out_p := jsonb_set(out_p, '{representativePassportNumber}', to_jsonb(bak.repr_passport_number), true);
  END IF;
  RETURN out_p;
END;
$$;

WITH merged AS (
  SELECT
    live.clinic_id,
    jsonb_set(
      live.data,
      '{patients}',
      COALESCE(
        (
          SELECT jsonb_agg(pg_temp.merge_patient_phi(live_p, bak) ORDER BY ord)
          FROM jsonb_array_elements(COALESCE(live.data->'patients', '[]'::jsonb))
            WITH ORDINALITY AS t(live_p, ord)
          LEFT JOIN tmp_patient_phi_restore bak
            ON bak.clinic_id = live.clinic_id::text
           AND bak.patient_id = live_p->>'id'
        ),
        '[]'::jsonb
      ),
      true
    ) AS data
  FROM clinic_snapshots live
)
UPDATE clinic_snapshots cs
SET
  data = merged.data,
  updated_at = NOW(),
  revision = COALESCE(cs.revision, 0) + 1
FROM merged
WHERE cs.clinic_id = merged.clinic_id;
SQL

echo ">>> Добиваем телефоны из onlineBookings живого снимка (по ФИО)…"
psql_live <<'SQL'
WITH candidates AS (
  SELECT
    cs.clinic_id,
    live_p->>'id' AS patient_id,
    (
      SELECT NULLIF(trim(b->>'phone'), '')
      FROM jsonb_array_elements(COALESCE(cs.data->'onlineBookings', '[]'::jsonb)) b
      WHERE COALESCE(NULLIF(trim(b->>'phone'), ''), '') <> ''
        AND lower(regexp_replace(COALESCE(b->>'patientName', ''), '\s+', ' ', 'g'))
          = lower(regexp_replace(
              concat_ws(
                ' ',
                NULLIF(trim(live_p->>'lastName'), ''),
                NULLIF(trim(live_p->>'firstName'), ''),
                NULLIF(trim(live_p->>'middleName'), '')
              ),
              '\s+',
              ' ',
              'g'
            ))
      LIMIT 1
    ) AS booking_phone
  FROM clinic_snapshots cs
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cs.data->'patients', '[]'::jsonb)) live_p
  WHERE COALESCE(NULLIF(trim(live_p->>'phone'), ''), '') = ''
),
to_apply AS (
  SELECT * FROM candidates WHERE booking_phone IS NOT NULL
),
merged AS (
  SELECT
    cs.clinic_id,
    jsonb_set(
      cs.data,
      '{patients}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE
              WHEN a.patient_id IS NOT NULL
                THEN live_p || jsonb_build_object('phone', a.booking_phone)
              ELSE live_p
            END
            ORDER BY ord
          )
          FROM jsonb_array_elements(COALESCE(cs.data->'patients', '[]'::jsonb))
            WITH ORDINALITY AS t(live_p, ord)
          LEFT JOIN to_apply a
            ON a.clinic_id = cs.clinic_id AND a.patient_id = live_p->>'id'
        ),
        '[]'::jsonb
      ),
      true
    ) AS data
  FROM clinic_snapshots cs
  WHERE EXISTS (SELECT 1 FROM to_apply a WHERE a.clinic_id = cs.clinic_id)
)
UPDATE clinic_snapshots cs
SET
  data = merged.data,
  updated_at = NOW(),
  revision = COALESCE(cs.revision, 0) + 1
FROM merged
WHERE cs.clinic_id = merged.clinic_id;
SQL

echo ">>> Результат:"
psql_live -c "
SELECT c.slug,
       COUNT(*) AS patients,
       COUNT(*) FILTER (
         WHERE COALESCE(NULLIF(trim(p->>'phone'), ''), '') <> ''
       ) AS with_phone,
       COUNT(*) FILTER (
         WHERE COALESCE(NULLIF(trim(p->>'phone'), ''), '') = ''
       ) AS empty_phone
FROM clinic_snapshots cs
JOIN clinics c ON c.id = cs.clinic_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cs.data->'patients', '[]'::jsonb)) p
GROUP BY c.slug
ORDER BY c.slug;
"

psql_live -c "DROP TABLE IF EXISTS tmp_patient_phi_restore;"
cleanup_tmp

echo ""
echo "Готово. Обновите страницу МИС (hard refresh) под owner/admin."
echo "Если номера всё ещё пустые — в выбранном бэкапе их уже не было;"
echo "попробуйте более ранний файл из backups/."
