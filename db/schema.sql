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
CREATE INDEX IF NOT EXISTS idx_clinics_slug ON clinics (slug);
