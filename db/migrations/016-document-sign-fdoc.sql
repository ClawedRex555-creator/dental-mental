-- Миграция 016: поля для интеграции F.Doc (REST API + webhook)

ALTER TABLE document_sign_requests
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'emkaro',
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS fdoc_status TEXT,
  ADD COLUMN IF NOT EXISTS fdoc_sign_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_document_url TEXT;

ALTER TABLE document_sign_requests
  ALTER COLUMN token_hash DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_sign_requests_provider_check'
  ) THEN
    ALTER TABLE document_sign_requests
      ADD CONSTRAINT document_sign_requests_provider_check
      CHECK (provider IN ('emkaro', 'fdoc'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_sign_requests_fdoc_external
  ON document_sign_requests (external_id)
  WHERE provider = 'fdoc' AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_sign_requests_fdoc_pending
  ON document_sign_requests (created_at)
  WHERE provider = 'fdoc' AND status = 'pending';
