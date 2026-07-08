-- Поиск и восстановление актов (workActs) в clinic_snapshots
-- Клиника ИП Макарова: slug обычно tstom (подставьте свой)
--
-- На сервере:
--   cd /opt/emkaro
--   docker compose exec -T postgres psql -U mis -d dentalcloud -f scripts/sql/find-and-recover-work-acts.sql
--
-- Slug клиники (ИП Макарова / tstom.emkaro.ru):
\set slug 'tstom'

\echo '=== 1. Сводка по клинике ==='
SELECT
  c.slug,
  c.name,
  cs.updated_at,
  COALESCE(jsonb_array_length(cs.data -> 'patients'), 0)     AS patients,
  COALESCE(jsonb_array_length(cs.data -> 'workActs'), 0)     AS work_acts,
  COALESCE(jsonb_array_length(cs.data -> 'payments'), 0)     AS payments,
  COALESCE(jsonb_array_length(cs.data -> 'appointments'), 0) AS appointments
FROM clinic_snapshots cs
JOIN clinics c ON c.id = cs.clinic_id
WHERE c.slug = :'slug';

\echo ''
\echo '=== 2. Пациенты по id (ФИО в БД зашифрованы — id возьмите из URL карточки в МИС: /patients/<id>) ==='
\echo 'Подставьте patient_id:'
\echo "  docker compose exec -T postgres psql -U mis -d dentalcloud -c \"SELECT p->>'id' FROM clinic_snapshots cs JOIN clinics c ON c.id=cs.clinic_id, jsonb_array_elements(cs.data->'patients') p WHERE c.slug='tstom' LIMIT 5;\""
\echo ''
\echo 'Пример поиска актов по patient_id (без расшифровки ПДн):'
-- WHERE a->>'patientId' = 'PASTE_PATIENT_ID_HERE'
\echo ''
\echo '=== 3. Акты по patient_id (подставьте id из МИС) ==='
-- Раскомментируйте и замените patient_id:
/*
SELECT
  a ->> 'id'             AS act_id,
  a ->> 'actNumber'      AS act_number,
  a ->> 'actDate'        AS act_date,
  a ->> 'patientId'      AS patient_id,
  a ->> 'appointmentId'  AS appointment_id,
  a ->> 'paymentStatus'  AS payment_status,
  (a ->> 'totalAmount')::numeric AS total_amount
FROM clinic_snapshots cs
JOIN clinics c ON c.id = cs.clinic_id,
     jsonb_array_elements(cs.data -> 'workActs') AS a
WHERE c.slug = :'slug'
  AND a ->> 'patientId' = 'PASTE_PATIENT_ID_HERE'
ORDER BY a ->> 'actDate' DESC;
*/
\echo ''
\echo '=== 4–5. Платежи и приёмы — тот же patient_id, без ПДн ==='
\echo 'Шаг A: загрузите старый снимок из pg_dump в отдельную БД или временную таблицу:'
\echo '  CREATE TABLE clinic_snapshots_backup AS SELECT * FROM clinic_snapshots;'
\echo '  -- затем подмените data из дампа для нужной клиники вручную'
\echo '  -- или восстановите дамп в БД dentalcloud_restore и выполните кросс-запрос ниже.'
\echo ''
\echo 'Акты, которые были в бэкапе, но отсутствуют в текущем снимке:'

-- Раскомментируйте после создания clinic_snapshots_backup (та же структура, одна строка клиники):
/*
WITH clinic AS (
  SELECT cs.clinic_id
  FROM clinic_snapshots cs
  JOIN clinics c ON c.id = cs.clinic_id
  WHERE c.slug = :'slug'
),
current_act_ids AS (
  SELECT a ->> 'id' AS id
  FROM clinic_snapshots cs
  JOIN clinic cl ON cl.clinic_id = cs.clinic_id,
       jsonb_array_elements(cs.data -> 'workActs') AS a
),
backup_acts AS (
  SELECT a AS act
  FROM clinic_snapshots_backup b
  JOIN clinic cl ON cl.clinic_id = b.clinic_id,
       jsonb_array_elements(b.data -> 'workActs') AS a
  WHERE a ->> 'patientId' = 'PASTE_PATIENT_ID_HERE'
)
SELECT
  act ->> 'id'        AS act_id,
  act ->> 'actNumber' AS act_number,
  act ->> 'actDate'  AS act_date,
  act ->> 'patientId' AS patient_id,
  act               AS full_act_json
FROM backup_acts
WHERE act ->> 'id' NOT IN (SELECT id FROM current_act_ids)
ORDER BY act ->> 'actDate' DESC;
*/

\echo ''
\echo '=== 7. ВОССТАНОВЛЕНИЕ: добавить пропавшие акты из бэкапа (ОСТОРОЖНО) ==='
\echo 'Перед UPDATE сделайте pg_dump! Проверьте act_id из п.6.'
\echo 'Замените :act_id_1, :act_id_2 на реальные id из бэкапа.'

/*
BEGIN;

WITH clinic AS (
  SELECT cs.clinic_id, cs.data
  FROM clinic_snapshots cs
  JOIN clinics c ON c.id = cs.clinic_id
  WHERE c.slug = :'slug'
),
to_restore AS (
  SELECT a AS act
  FROM clinic_snapshots_backup b
  JOIN clinic cl ON cl.clinic_id = b.clinic_id,
       jsonb_array_elements(b.data -> 'workActs') AS a
  WHERE a ->> 'id' IN ('act_id_1', 'act_id_2')  -- id из бэкапа
),
merged AS (
  SELECT
    cl.clinic_id,
    jsonb_set(
      cl.data,
      '{workActs}',
      COALESCE(cl.data -> 'workActs', '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(act) FROM to_restore), '[]'::jsonb)
    ) AS new_data
  FROM clinic cl
)
UPDATE clinic_snapshots cs
SET
  data = m.new_data,
  updated_at = NOW()
FROM merged m
WHERE cs.clinic_id = m.clinic_id;

-- При необходимости восстановите payments тем же способом (ключ workActs + payments).
-- ROLLBACK;  -- сначала проверка
COMMIT;
*/

\echo ''
\echo '=== 8. Бэкапы: только по act_id / patient_id (не grep по ФИО в дампах с шифрованием) ==='
\echo '  ls -lt backups/dentalcloud-*.sql | head'
