-- Миграция 017: Emkaro Sign (внешний сервис sign.emkaro.ru)

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS emkaro_sign_config JSONB NOT NULL DEFAULT '{}';

ALTER TABLE document_sign_requests
  DROP CONSTRAINT IF EXISTS document_sign_requests_provider_check;

ALTER TABLE document_sign_requests
  ADD CONSTRAINT document_sign_requests_provider_check
  CHECK (provider IN ('emkaro', 'fdoc', 'emkaro_sign'));

CREATE INDEX IF NOT EXISTS idx_document_sign_requests_emkaro_sign_external
  ON document_sign_requests (external_id)
  WHERE provider = 'emkaro_sign' AND external_id IS NOT NULL;
