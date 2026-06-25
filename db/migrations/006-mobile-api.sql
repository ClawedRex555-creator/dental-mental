-- Mobile API (Tstom): patient app accounts — additive, does not change existing tables.

CREATE TABLE IF NOT EXISTS mobile_patient_accounts (
  id TEXT PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  login TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  fcm_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, login),
  UNIQUE (clinic_id, patient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_patient_login_global ON mobile_patient_accounts (login);
CREATE INDEX IF NOT EXISTS idx_mobile_patient_clinic ON mobile_patient_accounts (clinic_id);
