import "server-only";

import type {
  EgiszClinicConfig,
  EgiszDocumentType,
  EgiszSubmissionPayload,
  EgiszSubmissionStatus,
} from "@/lib/egisz/types";
import { defaultEgiszConfig, parseEgiszConfig } from "@/lib/egisz/types";
import {
  mergeEgiszConfigForSave,
  resolveClinicEgiszConfig,
} from "@/lib/egisz/platform.server";
import { withDb } from "@/lib/db";

async function readRawEgiszConfig(clinicId: string): Promise<EgiszClinicConfig> {
  const raw = await withDb(async (client) => {
    const res = await client.query<{ egisz_config: unknown }>(
      `SELECT egisz_config FROM clinics WHERE id = $1 LIMIT 1`,
      [clinicId]
    );
    return res.rows[0]?.egisz_config;
  });
  return parseEgiszConfig(raw ?? defaultEgiszConfig());
}

export async function getEgiszConfig(clinicId: string): Promise<EgiszClinicConfig> {
  const stored = await readRawEgiszConfig(clinicId);
  return resolveClinicEgiszConfig(stored);
}

export async function getRawEgiszConfig(clinicId: string): Promise<EgiszClinicConfig> {
  return readRawEgiszConfig(clinicId);
}

export async function saveEgiszConfig(
  clinicId: string,
  config: EgiszClinicConfig
): Promise<EgiszClinicConfig> {
  const stored = await readRawEgiszConfig(clinicId);
  const merged = mergeEgiszConfigForSave(stored, config);
  const updated = await withDb(async (client) => {
    const res = await client.query(`UPDATE clinics SET egisz_config = $2::jsonb WHERE id = $1`, [
      clinicId,
      JSON.stringify(merged),
    ]);
    return res.rowCount;
  });
  if (updated === null) {
    throw new Error("База данных недоступна");
  }
  if (updated === 0) {
    throw new Error("Клиника не найдена в базе данных");
  }
  return resolveClinicEgiszConfig(merged);
}

export async function queueEgiszSubmission(input: {
  clinicId: string;
  patientId: string;
  medicalRecordId?: string;
  documentType: EgiszDocumentType;
  payload?: EgiszSubmissionPayload;
}): Promise<string | null> {
  return (
    (await withDb(async (client) => {
      if (input.medicalRecordId) {
        const dup = await client.query<{ id: string; status: EgiszSubmissionStatus }>(
          `SELECT id, status FROM egisz_submissions
           WHERE clinic_id = $1 AND medical_record_id = $2 AND document_type = $3
             AND status IN ('queued', 'error')
           ORDER BY created_at DESC LIMIT 1`,
          [input.clinicId, input.medicalRecordId, input.documentType]
        );
        const existing = dup.rows[0];
        if (existing) {
          if (existing.status === "queued") return existing.id;
          await client.query(
            `UPDATE egisz_submissions SET
               status = 'queued', error_message = NULL, updated_at = NOW()
             WHERE id = $1 AND clinic_id = $2 AND status = 'error'`,
            [existing.id, input.clinicId]
          );
          return existing.id;
        }
      }

      const res = await client.query<{ id: string }>(
        `INSERT INTO egisz_submissions
          (clinic_id, patient_id, medical_record_id, document_type, status, payload)
         VALUES ($1, $2, $3, $4, 'queued', $5::jsonb)
         RETURNING id`,
        [
          input.clinicId,
          input.patientId,
          input.medicalRecordId ?? null,
          input.documentType,
          JSON.stringify(input.payload ?? {}),
        ]
      );
      return res.rows[0]?.id ?? null;
    })) ?? null
  );
}

export async function requeueEgiszSubmission(
  submissionId: string,
  clinicId: string
): Promise<boolean> {
  const updated = await withDb(async (client) => {
    const res = await client.query(
      `UPDATE egisz_submissions SET
         status = 'queued', error_message = NULL, updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2 AND status = 'error'`,
      [submissionId, clinicId]
    );
    return res.rowCount ?? 0;
  });
  return (updated ?? 0) > 0;
}

export interface EgiszSubmissionRow {
  id: string;
  clinicId: string;
  patientId: string;
  medicalRecordId?: string;
  documentType: EgiszDocumentType;
  status: EgiszSubmissionStatus;
  externalId?: string;
  errorMessage?: string;
  payload: EgiszSubmissionPayload;
  createdAt: string;
  submittedAt?: string;
}

function mapSubmissionRow(r: {
  id: string;
  clinic_id: string;
  patient_id: string;
  medical_record_id: string | null;
  document_type: EgiszDocumentType;
  status: EgiszSubmissionStatus;
  external_id: string | null;
  error_message: string | null;
  payload: unknown;
  created_at: Date;
  submitted_at: Date | null;
}): EgiszSubmissionRow {
  return {
    id: r.id,
    clinicId: r.clinic_id,
    patientId: r.patient_id,
    medicalRecordId: r.medical_record_id ?? undefined,
    documentType: r.document_type,
    status: r.status,
    externalId: r.external_id ?? undefined,
    errorMessage: r.error_message ?? undefined,
    payload: (r.payload as EgiszSubmissionPayload) ?? {},
    createdAt: r.created_at.toISOString(),
    submittedAt: r.submitted_at?.toISOString(),
  };
}

export async function getEgiszSubmissionById(
  id: string,
  clinicId?: string
): Promise<EgiszSubmissionRow | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        clinic_id: string;
        patient_id: string;
        medical_record_id: string | null;
        document_type: EgiszDocumentType;
        status: EgiszSubmissionStatus;
        external_id: string | null;
        error_message: string | null;
        payload: unknown;
        created_at: Date;
        submitted_at: Date | null;
      }>(
        clinicId
          ? `SELECT id, clinic_id, patient_id, medical_record_id, document_type, status,
                    external_id, error_message, payload, created_at, submitted_at
             FROM egisz_submissions WHERE id = $1 AND clinic_id = $2 LIMIT 1`
          : `SELECT id, clinic_id, patient_id, medical_record_id, document_type, status,
                    external_id, error_message, payload, created_at, submitted_at
             FROM egisz_submissions WHERE id = $1 LIMIT 1`,
        clinicId ? [id, clinicId] : [id]
      );
      const row = res.rows[0];
      return row ? mapSubmissionRow(row) : null;
    })) ?? null
  );
}

export async function updateEgiszSubmission(
  id: string,
  update: {
    status: EgiszSubmissionStatus;
    externalId?: string;
    errorMessage?: string;
    payload?: EgiszSubmissionPayload;
  }
): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE egisz_submissions SET
         status = $2,
         external_id = COALESCE($3, external_id),
         error_message = $4,
         payload = COALESCE($5::jsonb, payload),
         submitted_at = CASE WHEN $2 IN ('sent', 'accepted') THEN COALESCE(submitted_at, NOW()) ELSE submitted_at END,
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        update.status,
        update.externalId ?? null,
        update.errorMessage ?? null,
        update.payload ? JSON.stringify(update.payload) : null,
      ]
    );
  });
}

export async function listQueuedEgiszSubmissions(
  clinicId?: string,
  limit = 10
): Promise<EgiszSubmissionRow[]> {
  return (
    (await withDb(async (client) => {
      const res = clinicId
        ? await client.query(
            `SELECT id, clinic_id, patient_id, medical_record_id, document_type, status,
                    external_id, error_message, payload, created_at, submitted_at
             FROM egisz_submissions WHERE clinic_id = $1 AND status = 'queued'
             ORDER BY created_at ASC LIMIT $2`,
            [clinicId, limit]
          )
        : await client.query(
            `SELECT id, clinic_id, patient_id, medical_record_id, document_type, status,
                    external_id, error_message, payload, created_at, submitted_at
             FROM egisz_submissions WHERE status = 'queued'
             ORDER BY created_at ASC LIMIT $1`,
            [limit]
          );
      return res.rows.map((r) => mapSubmissionRow(r as Parameters<typeof mapSubmissionRow>[0]));
    })) ?? []
  );
}

export async function listEgiszSubmissions(clinicId: string, limit = 50) {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        patient_id: string;
        medical_record_id: string | null;
        document_type: EgiszDocumentType;
        status: EgiszSubmissionStatus;
        external_id: string | null;
        error_message: string | null;
        created_at: Date;
        submitted_at: Date | null;
      }>(
        `SELECT id, patient_id, medical_record_id, document_type, status,
                external_id, error_message, created_at, submitted_at
         FROM egisz_submissions WHERE clinic_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [clinicId, limit]
      );
      return res.rows.map((r) => ({
        id: r.id,
        patientId: r.patient_id,
        medicalRecordId: r.medical_record_id ?? undefined,
        documentType: r.document_type,
        status: r.status,
        externalId: r.external_id ?? undefined,
        errorMessage: r.error_message ?? undefined,
        createdAt: r.created_at.toISOString(),
        submittedAt: r.submitted_at?.toISOString(),
      }));
    })) ?? []
  );
}

/** Обработка одной отправки из очереди (только для своей клиники). */
export async function processEgiszSubmission(
  submissionId: string,
  clinicId?: string
): Promise<void> {
  if (clinicId) {
    const submission = await getEgiszSubmissionById(submissionId, clinicId);
    if (!submission) {
      throw new Error("Отправка не найдена или принадлежит другой клинике");
    }
  }
  const { processEgiszSubmissionWorker } = await import("@/lib/egisz/worker.server");
  try {
    await processEgiszSubmissionWorker(submissionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const short = msg.length > 500 ? `${msg.slice(0, 500)}…` : msg;
    await updateEgiszSubmission(submissionId, {
      status: "error",
      errorMessage: short,
    });
    throw e;
  }
}
