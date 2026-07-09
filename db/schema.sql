-- Emkaro — multi-clinic schema (auth + tenant registry)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(63) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinics_slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
);

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  login TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  staff_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, login)
);

CREATE INDEX IF NOT EXISTS idx_auth_users_clinic_login ON auth_users (clinic_id, login);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_login_global ON auth_users (login);
CREATE INDEX IF NOT EXISTS idx_clinics_slug ON clinics (slug);

-- Сотрудники клиники (синхронизация между устройствами)
CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT NOT NULL,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clinic_id, id)
);

CREATE INDEX IF NOT EXISTS idx_staff_members_clinic ON staff_members (clinic_id);

-- Полный снимок данных клиники (синхронизация между устройствами).
-- Структура data: ClinicPersistedState (patients[], appointments[], medicalRecords[], …).
-- Счётчики для аудита: VIEW clinic_snapshot_stats (миграция 004).
CREATE TABLE IF NOT EXISTS clinic_snapshots (
  clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- См. db/migrations/002-platform-compliance-egisz.sql (platform_admins, audit_logs, egisz, modules)
