import "server-only";

import { withDb } from "@/lib/db";

export type PatientConsentType =
  | "personal_data_processing"
  | "medical_intervention"
  | "egisz_transfer";

export interface PatientConsentRecord {
  id: string;
  patientId: string;
  consentType: PatientConsentType;
  granted: boolean;
  grantedAt: string;
  revokedAt?: string;
  documentRef?: string;
  notes?: string;
}

const CONSENT_LABELS: Record<PatientConsentType, string> = {
  personal_data_processing: "Обработка персональных данных",
  medical_intervention: "Медицинское вмешательство",
  egisz_transfer: "Передача данных в ЕГИСЗ",
};

export { CONSENT_LABELS };

/** Согласие на передачу в ЕГИСЗ (таблица patient_consents, тип egisz_transfer). */
export async function hasPatientEgiszTransferConsent(
  clinicId: string,
  patientId: string
): Promise<boolean> {
  const consents = await listPatientConsents(clinicId, patientId);
  return consents.some((c) => c.consentType === "egisz_transfer" && c.granted);
}

export async function listPatientConsents(
  clinicId: string,
  patientId: string
): Promise<PatientConsentRecord[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        patient_id: string;
        consent_type: PatientConsentType;
        granted: boolean;
        granted_at: Date;
        revoked_at: Date | null;
        document_ref: string | null;
        notes: string | null;
      }>(
        `SELECT id, patient_id, consent_type, granted, granted_at, revoked_at, document_ref, notes
         FROM patient_consents WHERE clinic_id = $1 AND patient_id = $2
         ORDER BY consent_type ASC`,
        [clinicId, patientId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        patientId: r.patient_id,
        consentType: r.consent_type,
        granted: r.granted,
        grantedAt: r.granted_at.toISOString(),
        revokedAt: r.revoked_at?.toISOString(),
        documentRef: r.document_ref ?? undefined,
        notes: r.notes ?? undefined,
      }));
    })) ?? []
  );
}

export async function upsertPatientConsent(input: {
  clinicId: string;
  patientId: string;
  consentType: PatientConsentType;
  granted: boolean;
  documentRef?: string;
  recordedBy?: string;
  notes?: string;
}): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO patient_consents
        (clinic_id, patient_id, consent_type, granted, granted_at, revoked_at, document_ref, recorded_by, notes)
       VALUES ($1, $2, $3, $4, NOW(), CASE WHEN $4 THEN NULL ELSE NOW() END, $5, $6, $7)
       ON CONFLICT (clinic_id, patient_id, consent_type) DO UPDATE SET
         granted = EXCLUDED.granted,
         granted_at = CASE WHEN EXCLUDED.granted THEN NOW() ELSE patient_consents.granted_at END,
         revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE NOW() END,
         document_ref = COALESCE(EXCLUDED.document_ref, patient_consents.document_ref),
         recorded_by = EXCLUDED.recorded_by,
         notes = COALESCE(EXCLUDED.notes, patient_consents.notes)`,
      [
        input.clinicId,
        input.patientId,
        input.consentType,
        input.granted,
        input.documentRef ?? null,
        input.recordedBy ?? null,
        input.notes ?? null,
      ]
    );
  });
}
