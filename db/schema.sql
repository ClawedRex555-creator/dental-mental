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
  session_version BIGINT NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS platform_connection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  desired_slug TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'landing',
  status TEXT NOT NULL DEFAULT 'new',
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  owner_user_id TEXT,
  handled_at TIMESTAMPTZ,
  handled_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_connection_requests_status_check CHECK (
    status IN ('new', 'contacted', 'approved', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_platform_connection_requests_status_created
  ON platform_connection_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_connection_requests_created
  ON platform_connection_requests (created_at DESC);

-- См. db/migrations/002-platform-compliance-egisz.sql (platform_admins, audit_logs, egisz, modules)
