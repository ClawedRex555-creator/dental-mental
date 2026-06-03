-- Миграция 002: супер-админ, модули, compliance, ЕГИСЗ
-- Безопасно повторно: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '{}';

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS egisz_config JSONB NOT NULL DEFAULT '{}';

-- Супер-администраторы платформы (не привязаны к клинике)
CREATE TABLE IF NOT EXISTS platform_admins (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Журнал доступа к персональным данным (152-ФЗ)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  user_id TEXT,
  user_name TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_created
  ON audit_logs (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
  ON audit_logs (clinic_id, resource_type, resource_id);

-- Согласия пациентов на обработку ПДн
CREATE TABLE IF NOT EXISTS patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  document_ref TEXT,
  recorded_by TEXT,
  notes TEXT,
  UNIQUE (clinic_id, patient_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_patient_consents_clinic_patient
  ON patient_consents (clinic_id, patient_id);

-- Очередь отправки в ЕГИСЗ (СЭМД / регистрация случая)
CREATE TABLE IF NOT EXISTS egisz_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  medical_record_id TEXT,
  document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  payload JSONB NOT NULL DEFAULT '{}',
  external_id TEXT,
  error_message TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_egisz_submissions_clinic_status
  ON egisz_submissions (clinic_id, status, created_at DESC);

-- Инициализация modules для существующих клиник (пустой {} → дефолты на уровне приложения)
UPDATE clinics SET modules = '{}'::jsonb WHERE modules IS NULL;
