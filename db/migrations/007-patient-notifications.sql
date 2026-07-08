-- Миграция 007: уведомления пациентов о записях

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS notifications_config JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'appointment_reminder',
  reminder_offset_minutes INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  message_preview TEXT,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_deliveries_status_check CHECK (
    status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'retry', 'cancelled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_deliveries_dedupe
  ON notification_deliveries (
    clinic_id,
    appointment_id,
    channel,
    reminder_offset_minutes,
    event_type
  )
  WHERE status IN ('pending', 'retry', 'sending');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_process
  ON notification_deliveries (status, scheduled_at)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_clinic_created
  ON notification_deliveries (clinic_id, created_at DESC);
