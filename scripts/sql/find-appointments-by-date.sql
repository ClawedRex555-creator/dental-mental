-- Приёмы по датам в clinic_snapshots (без расшифровки ПДн)
-- На сервере:
--   cd /opt/emkaro
--   docker compose exec -T postgres psql -U mis -d dentalcloud -f scripts/sql/find-appointments-by-date.sql
--
\set slug 'tstom'

\echo '=== 1. Сводка: всего приёмов в текущем снимке ==='
SELECT
  c.slug,
  cs.updated_at,
  COALESCE(jsonb_array_length(cs.data -> 'appointments'), 0) AS appointments_total
FROM clinic_snapshots cs
JOIN clinics c ON c.id = cs.clinic_id
WHERE c.slug = :'slug';

\echo ''
\echo '=== 2. Приёмы по дате (активные, не отменённые) ==='
SELECT
  a ->> 'date' AS apt_date,
  COUNT(*) AS cnt,
  COUNT(*) FILTER (WHERE a ->> 'status' = 'cancelled') AS cancelled,
  COUNT(*) FILTER (WHERE COALESCE(a ->> 'isOtherClinicVisit', 'false') = 'true') AS other_clinic
FROM clinic_snapshots cs
JOIN clinics c ON c.id = cs.clinic_id,
     jsonb_array_elements(cs.data -> 'appointments') AS a
WHERE c.slug = :'slug'
GROUP BY a ->> 'date'
ORDER BY apt_date;

\echo ''
\echo '=== 3. Конкретная дата (подставьте yyyy-mm-dd) ==='
\echo "Пример: WHERE a ->> 'date' = '2026-07-09'"
/*
SELECT
  a ->> 'id'          AS apt_id,
  a ->> 'date'        AS apt_date,
  a ->> 'startTime'   AS start_time,
  a ->> 'doctorId'    AS doctor_id,
  a ->> 'patientId'   AS patient_id,
  a ->> 'status'      AS status
FROM clinic_snapshots cs
JOIN clinics c ON c.id = cs.clinic_id,
     jsonb_array_elements(cs.data -> 'appointments') AS a
WHERE c.slug = :'slug'
  AND a ->> 'date' IN ('2026-07-09', '2026-07-11')
ORDER BY a ->> 'date', a ->> 'startTime';
*/

\echo ''
\echo '=== 4. Сравнение с бэкапом (если есть clinic_snapshots_backup) ==='
/*
WITH clinic AS (
  SELECT cs.clinic_id
  FROM clinic_snapshots cs
  JOIN clinics c ON c.id = cs.clinic_id
  WHERE c.slug = :'slug'
),
current_by_date AS (
  SELECT a ->> 'date' AS apt_date, COUNT(*) AS cnt
  FROM clinic_snapshots cs
  JOIN clinic cl ON cl.clinic_id = cs.clinic_id,
       jsonb_array_elements(cs.data -> 'appointments') AS a
  WHERE COALESCE(a ->> 'status', 'scheduled') <> 'cancelled'
  GROUP BY a ->> 'date'
),
backup_by_date AS (
  SELECT a ->> 'date' AS apt_date, COUNT(*) AS cnt
  FROM clinic_snapshots_backup b
  JOIN clinic cl ON cl.clinic_id = b.clinic_id,
       jsonb_array_elements(b.data -> 'appointments') AS a
  WHERE COALESCE(a ->> 'status', 'scheduled') <> 'cancelled'
  GROUP BY a ->> 'date'
)
SELECT
  COALESCE(c.apt_date, b.apt_date) AS apt_date,
  COALESCE(b.cnt, 0) AS backup_cnt,
  COALESCE(c.cnt, 0) AS current_cnt,
  COALESCE(b.cnt, 0) - COALESCE(c.cnt, 0) AS lost
FROM backup_by_date b
FULL OUTER JOIN current_by_date c ON c.apt_date = b.apt_date
WHERE COALESCE(b.cnt, 0) <> COALESCE(c.cnt, 0)
ORDER BY apt_date;
*/
