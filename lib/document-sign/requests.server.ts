import "server-only";

import { withDb } from "@/lib/db";
import type {
  DocumentSignProvider,
  DocumentSignRef,
  DocumentSignRequestRecord,
  DocumentSignStatus,
} from "@/lib/document-sign/types";

interface DbRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string | null;
  phone: string;
  document_refs: DocumentSignRef[];
  provider: DocumentSignProvider;
  external_id: string | null;
  fdoc_status: string | null;
  fdoc_sign_url: string | null;
  signed_document_url: string | null;
  status: DocumentSignStatus;
  otp_hash: string | null;
  otp_attempts: number;
  token_hash: string | null;
  expires_at: Date;
  signed_at: Date | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  created_by: string | null;
  created_at: Date;
}

function mapRow(r: DbRow): DocumentSignRequestRecord {
  return {
    id: r.id,
    clinicId: r.clinic_id,
    patientId: r.patient_id,
    appointmentId: r.appointment_id ?? undefined,
    phone: r.phone,
    documentRefs: Array.isArray(r.document_refs) ? r.document_refs : [],
    provider: r.provider ?? "emkaro",
    externalId: r.external_id ?? undefined,
    fdocStatus: r.fdoc_status ?? undefined,
    fdocSignUrl: r.fdoc_sign_url ?? undefined,
    signedDocumentUrl: r.signed_document_url ?? undefined,
    status: r.status,
    expiresAt: r.expires_at.toISOString(),
    signedAt: r.signed_at?.toISOString(),
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at.toISOString(),
  };
}

export async function createDocumentSignRequest(input: {
  id?: string;
  clinicId: string;
  patientId: string;
  appointmentId?: string;
  phone: string;
  documentRefs: DocumentSignRef[];
  provider?: DocumentSignProvider;
  externalId?: string;
  fdocStatus?: string;
  fdocSignUrl?: string;
  otpHash?: string;
  tokenHash?: string;
  expiresAt: Date;
  createdBy?: string;
}): Promise<DocumentSignRequestRecord | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<DbRow>(
        `INSERT INTO document_sign_requests
          (id, clinic_id, patient_id, appointment_id, phone, document_refs, provider,
           external_id, fdoc_status, fdoc_sign_url, otp_hash, token_hash, expires_at, created_by)
         VALUES (
           COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, $7,
           $8, $9, $10, $11, $12, $13, $14
         )
         RETURNING *`,
        [
          input.id ?? null,
          input.clinicId,
          input.patientId,
          input.appointmentId ?? null,
          input.phone,
          JSON.stringify(input.documentRefs),
          input.provider ?? "emkaro",
          input.externalId ?? null,
          input.fdocStatus ?? null,
          input.fdocSignUrl ?? null,
          input.otpHash ?? null,
          input.tokenHash ?? null,
          input.expiresAt.toISOString(),
          input.createdBy ?? null,
        ]
      );
      return mapRow(res.rows[0]!);
    })) ?? null
  );
}

export async function getDocumentSignRequestById(
  clinicId: string,
  requestId: string
): Promise<DocumentSignRequestRecord | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<DbRow>(
        `SELECT * FROM document_sign_requests WHERE clinic_id = $1 AND id = $2`,
        [clinicId, requestId]
      );
      const row = res.rows[0];
      return row ? mapRow(row) : null;
    })) ?? null
  );
}

export async function getDocumentSignRequestByExternalId(
  externalId: string
): Promise<DocumentSignRequestRecord | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<DbRow>(
        `SELECT * FROM document_sign_requests
         WHERE provider = 'fdoc' AND external_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [externalId]
      );
      const row = res.rows[0];
      return row ? mapRow(row) : null;
    })) ?? null
  );
}

export async function getDocumentSignRequestByTokenHash(
  tokenHash: string
): Promise<(DocumentSignRequestRecord & { otpHash: string | null; otpAttempts: number }) | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<DbRow>(
        `SELECT * FROM document_sign_requests WHERE token_hash = $1 LIMIT 1`,
        [tokenHash]
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        ...mapRow(row),
        otpHash: row.otp_hash,
        otpAttempts: row.otp_attempts,
      };
    })) ?? null
  );
}

export async function listDocumentSignRequests(
  clinicId: string,
  patientId: string,
  limit = 20
): Promise<DocumentSignRequestRecord[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<DbRow>(
        `SELECT * FROM document_sign_requests
         WHERE clinic_id = $1 AND patient_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [clinicId, patientId, limit]
      );
      return res.rows.map(mapRow);
    })) ?? []
  );
}

export async function listPendingFdocDocumentSignRequests(
  limit = 50
): Promise<DocumentSignRequestRecord[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<DbRow>(
        `SELECT * FROM document_sign_requests
         WHERE provider = 'fdoc' AND status = 'pending' AND external_id IS NOT NULL
         ORDER BY created_at ASC
         LIMIT $1`,
        [limit]
      );
      return res.rows.map(mapRow);
    })) ?? []
  );
}

export async function cancelPendingDocumentSignRequests(
  clinicId: string,
  patientId: string
): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE document_sign_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE clinic_id = $1 AND patient_id = $2 AND status = 'pending'`,
      [clinicId, patientId]
    );
  });
}

export async function markDocumentSignExpired(requestId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE document_sign_requests
       SET status = 'expired', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [requestId]
    );
  });
}

export async function incrementDocumentSignOtpAttempts(requestId: string): Promise<number> {
  const result = await withDb(async (client) => {
    const res = await client.query<{ otp_attempts: number }>(
      `UPDATE document_sign_requests
       SET otp_attempts = otp_attempts + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING otp_attempts`,
      [requestId]
    );
    return res.rows[0]?.otp_attempts ?? 0;
  });
  return result ?? 0;
}

export async function markDocumentSignSigned(input: {
  requestId: string;
  signedIp?: string;
  signedUserAgent?: string;
}): Promise<boolean> {
  const ok = await withDb(async (client) => {
    const res = await client.query(
      `UPDATE document_sign_requests
       SET status = 'signed', signed_at = NOW(), signed_ip = $2, signed_user_agent = $3, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [input.requestId, input.signedIp ?? null, input.signedUserAgent ?? null]
    );
    return (res.rowCount ?? 0) > 0;
  });
  return Boolean(ok);
}

export async function markDocumentSignFailed(requestId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE document_sign_requests
       SET status = 'failed', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [requestId]
    );
  });
}

export async function updateDocumentSignFdocMeta(input: {
  requestId: string;
  externalId?: string;
  fdocStatus?: string;
  fdocSignUrl?: string;
  signedDocumentUrl?: string;
}): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE document_sign_requests SET
         external_id = COALESCE($2, external_id),
         fdoc_status = COALESCE($3, fdoc_status),
         fdoc_sign_url = COALESCE($4, fdoc_sign_url),
         signed_document_url = COALESCE($5, signed_document_url),
         updated_at = NOW()
       WHERE id = $1`,
      [
        input.requestId,
        input.externalId ?? null,
        input.fdocStatus ?? null,
        input.fdocSignUrl ?? null,
        input.signedDocumentUrl ?? null,
      ]
    );
  });
}
