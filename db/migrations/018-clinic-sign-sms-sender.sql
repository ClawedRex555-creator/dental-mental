-- Миграция 018: clinic SMS sender (ручная отправка SMS с телефона клиники) + статусы Sign

-- Устройства отправки клиники
CREATE TABLE IF NOT EXISTS clinic_sign_sender_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Телефон клиники',
  declared_phone_number TEXT,
  device_token_hash TEXT NOT NULL,
  device_name TEXT,
  platform TEXT,
  paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paired_by_user_id TEXT,
  last_seen_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_sign_sender_devices_status_check CHECK (
    status IN ('active', 'revoked', 'expired')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_sign_sender_devices_token
  ON clinic_sign_sender_devices (device_token_hash)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_clinic_sign_sender_devices_clinic
  ON clinic_sign_sender_devices (clinic_id, status);

-- Одноразовые pairing-токены
CREATE TABLE IF NOT EXISTS clinic_sign_pairing_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  short_code TEXT NOT NULL,
  created_by_user_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_sign_pairing_tokens_short_code_format CHECK (
    short_code ~ '^[0-9]{6}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_sign_pairing_unused_code
  ON clinic_sign_pairing_tokens (clinic_id, short_code)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_sign_pairing_expires
  ON clinic_sign_pairing_tokens (expires_at)
  WHERE used_at IS NULL;

-- Задачи ручной отправки SMS
CREATE TABLE IF NOT EXISTS clinic_sms_send_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL,
  sign_request_id UUID REFERENCES document_sign_requests(id) ON DELETE SET NULL,
  patient_id TEXT NOT NULL,
  patient_display_name TEXT NOT NULL DEFAULT '',
  recipient_phone TEXT NOT NULL,
  recipient_phone_masked TEXT NOT NULL DEFAULT '',
  sms_text TEXT NOT NULL,
  public_sign_url TEXT NOT NULL,
  document_titles JSONB NOT NULL DEFAULT '[]',
  device_id UUID REFERENCES clinic_sign_sender_devices(id) ON DELETE SET NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  presented_at TIMESTAMPTZ,
  composer_opened_at TIMESTAMPTZ,
  manual_send_confirmed_at TIMESTAMPTZ,
  manual_send_confirmed_by TEXT,
  idempotency_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_sms_send_tasks_status_check CHECK (
    status IN (
      'CREATED',
      'WAITING_FOR_DEVICE',
      'PRESENTED_TO_DEVICE',
      'SMS_COMPOSER_OPENED',
      'MANUAL_SEND_CONFIRMED',
      'CANCELLED',
      'EXPIRED',
      'FAILED'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_clinic_sms_send_tasks_clinic_status
  ON clinic_sms_send_tasks (clinic_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_sms_send_tasks_idempotency
  ON clinic_sms_send_tasks (clinic_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_sms_send_tasks_package
  ON clinic_sms_send_tasks (package_id);

-- Расширение document_sign_requests: статусы подписи (не boolean-only)
ALTER TABLE document_sign_requests
  ADD COLUMN IF NOT EXISTS signature_status TEXT,
  ADD COLUMN IF NOT EXISTS signature_method TEXT,
  ADD COLUMN IF NOT EXISTS sign_package_id TEXT,
  ADD COLUMN IF NOT EXISTS sign_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS last_sign_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_sign_requests_idempotency
  ON document_sign_requests (clinic_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Идемпотентность webhook Sign
CREATE TABLE IF NOT EXISTS emkaro_sign_webhook_events (
  event_id TEXT PRIMARY KEY,
  clinic_id UUID,
  package_id TEXT,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_emkaro_sign_webhook_events_package
  ON emkaro_sign_webhook_events (package_id, received_at DESC);
