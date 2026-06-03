-- Мониторинг целостности снимка клиники (пациенты, приёмы и т.д.)

CREATE OR REPLACE VIEW clinic_snapshot_stats AS
SELECT
  c.slug,
  c.name,
  cs.clinic_id,
  cs.updated_at,
  cs.version,
  COALESCE(jsonb_array_length(cs.data -> 'patients'), 0) AS patient_count,
  COALESCE(jsonb_array_length(cs.data -> 'appointments'), 0) AS appointment_count,
  COALESCE(jsonb_array_length(cs.data -> 'doctors'), 0) AS doctor_count,
  COALESCE(jsonb_array_length(cs.data -> 'services'), 0) AS service_count,
  COALESCE(jsonb_array_length(cs.data -> 'medicalRecords'), 0) AS medical_record_count,
  COALESCE(jsonb_array_length(cs.data -> 'treatmentPlans'), 0) AS treatment_plan_count
FROM clinic_snapshots cs
JOIN clinics c ON c.id = cs.clinic_id;

COMMENT ON VIEW clinic_snapshot_stats IS
  'Счётчики сущностей в JSONB-снимке; для аудита после деплоя и бэкапов';
