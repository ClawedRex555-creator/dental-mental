-- Distributed rate-limit buckets (login / landing) + mobile patient session revoke

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  attempt_count INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset
  ON rate_limit_buckets (reset_at);

ALTER TABLE mobile_patient_accounts
  ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 0;
