-- MedFlex / ПроДокторов: конфиг интеграции на клинику
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS medflex_config JSONB NOT NULL DEFAULT '{}';
