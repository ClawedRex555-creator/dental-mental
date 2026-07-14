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

ALTER TABLE platform_connection_requests
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL;

ALTER TABLE platform_connection_requests
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_connection_requests_status_created
  ON platform_connection_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_connection_requests_created
  ON platform_connection_requests (created_at DESC);
