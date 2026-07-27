-- Consent fields for landing connection requests (152-FZ)
ALTER TABLE platform_connection_requests
  ADD COLUMN IF NOT EXISTS pd_consent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE platform_connection_requests
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE platform_connection_requests
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

-- Existing rows (if any) are historical; new inserts must set pd_consent = true via API.
