-- Миграция 015: подпись документов пациентом по SMS (ПЭП, собственная система Emkaro)

CREATE TABLE IF NOT EXISTS document_sign_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  appointment_id TEXT,
  phone TEXT NOT NULL,
  document_refs JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  otp_hash TEXT,
  otp_attempts INT NOT NULL DEFAULT 0,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  signed_at TIMESTAMPTZ,
  signed_ip TEXT,
  signed_user_agent TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_sign_requests_status_check CHECK (
    status IN ('pending', 'signed', 'expired', 'cancelled', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_document_sign_requests_clinic_patient
  ON document_sign_requests (clinic_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_sign_requests_token_hash
  ON document_sign_requests (token_hash)
  WHERE status = 'pending';
