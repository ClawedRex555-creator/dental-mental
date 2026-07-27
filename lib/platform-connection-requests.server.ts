import "server-only";

import { createHash, randomBytes } from "crypto";
import { withDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth-password";
import { createFreshPersistedState } from "@/lib/clinic-persisted-state";
import { clinicLoginUrl } from "@/lib/clinic-host";

export type ConnectionRequestStatus = "new" | "contacted" | "approved" | "rejected";

export interface PlatformConnectionRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  clinicName: string;
  contactName: string;
  phone: string;
  email: string;
  desiredSlug: string | null;
  message: string | null;
  source: string;
  status: ConnectionRequestStatus;
  clinicId: string | null;
  ownerUserId: string | null;
  handledAt: string | null;
  handledBy: string | null;
  notes: string | null;
  pdConsent: boolean;
  marketingConsent: boolean;
  consentAt: string | null;
}

export interface CreateConnectionRequestInput {
  clinicName: string;
  contactName: string;
  phone: string;
  email: string;
  desiredSlug?: string;
  message?: string;
  source?: string;
  pdConsent: boolean;
  marketingConsent?: boolean;
}

function normalizeOptionalText(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createConnectionRequest(
  input: CreateConnectionRequestInput
): Promise<{ id: string }> {
  const clinicName = input.clinicName.trim();
  const contactName = input.contactName.trim();
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();
  const desiredSlug = normalizeOptionalText(input.desiredSlug)?.toLowerCase();
  const message = normalizeOptionalText(input.message);
  const source = normalizeOptionalText(input.source) ?? "landing";
  if (!input.pdConsent) {
    throw new Error("PD_CONSENT_REQUIRED");
  }
  const marketingConsent = Boolean(input.marketingConsent);

  const created = await withDb(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO platform_connection_requests
        (clinic_name, contact_name, phone, email, desired_slug, message, source,
         pd_consent, marketing_consent, consent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, NOW())
       RETURNING id`,
      [
        clinicName,
        contactName,
        phone,
        email,
        desiredSlug,
        message,
        source,
        marketingConsent,
      ]
    );
    return res.rows[0] ?? null;
  });
  if (!created) throw new Error("DATABASE_URL не настроен");
  return { id: created.id };
}

export async function listConnectionRequests(): Promise<PlatformConnectionRequest[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        created_at: Date;
        updated_at: Date;
        clinic_name: string;
        contact_name: string;
        phone: string;
        email: string;
        desired_slug: string | null;
        message: string | null;
        source: string;
        status: ConnectionRequestStatus;
        clinic_id: string | null;
        owner_user_id: string | null;
        handled_at: Date | null;
        handled_by: string | null;
        notes: string | null;
        pd_consent: boolean;
        marketing_consent: boolean;
        consent_at: Date | null;
      }>(
        `SELECT id, created_at, updated_at, clinic_name, contact_name, phone, email,
                desired_slug, message, source, status, clinic_id, owner_user_id,
                handled_at, handled_by, notes, pd_consent, marketing_consent, consent_at
           FROM platform_connection_requests
          ORDER BY created_at DESC`
      );
      return res.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        clinicName: row.clinic_name,
        contactName: row.contact_name,
        phone: row.phone,
        email: row.email,
        desiredSlug: row.desired_slug,
        message: row.message,
        source: row.source,
        status: row.status,
        clinicId: row.clinic_id,
        ownerUserId: row.owner_user_id,
        handledAt: row.handled_at?.toISOString() ?? null,
        handledBy: row.handled_by,
        notes: row.notes,
        pdConsent: row.pd_consent,
        marketingConsent: row.marketing_consent,
        consentAt: row.consent_at?.toISOString() ?? null,
      }));
    })) ?? []
  );
}

export async function updateConnectionRequestStatus(input: {
  id: string;
  status: ConnectionRequestStatus;
  handledBy?: string;
  notes?: string;
}): Promise<boolean> {
  const updated = await withDb(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE platform_connection_requests
          SET status = $2,
              notes = COALESCE($3, notes),
              handled_by = COALESCE($4, handled_by),
              handled_at = CASE
                WHEN $2 IN ('contacted', 'approved', 'rejected') THEN NOW()
                ELSE handled_at
              END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [input.id, input.status, normalizeOptionalText(input.notes), input.handledBy ?? null]
    );
    return Boolean(res.rows[0]);
  });
  return updated ?? false;
}

function makeSlugCandidate(input: string): string {
  const ascii = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii.slice(0, 63) || "clinic";
}

function generateTempPassword(): string {
  return `Emkaro!${randomBytes(5).toString("hex")}`;
}

export async function provisionClinicFromRequest(input: {
  requestId: string;
  handledBy: string;
}): Promise<{
  clinicId: string;
  clinicSlug: string;
  ownerUserId: string;
  ownerEmail: string;
  tempPassword: string;
  loginUrl: string;
}> {
  const tempPassword = generateTempPassword();

  const provisioned = await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      const requestRes = await client.query<{
        id: string;
        clinic_name: string;
        contact_name: string;
        email: string;
        desired_slug: string | null;
        clinic_id: string | null;
      }>(
        `SELECT id, clinic_name, contact_name, email, desired_slug, clinic_id
           FROM platform_connection_requests
          WHERE id = $1
          FOR UPDATE`,
        [input.requestId]
      );
      const request = requestRes.rows[0];
      if (!request) throw new Error("REQUEST_NOT_FOUND");

      if (request.clinic_id) {
        const existingClinic = await client.query<{ id: string; slug: string }>(
          `SELECT id, slug FROM clinics WHERE id = $1 LIMIT 1`,
          [request.clinic_id]
        );
        const row = existingClinic.rows[0];
        if (row) {
          throw new Error("CLINIC_ALREADY_PROVISIONED");
        }
      }

      const baseSlug = makeSlugCandidate(request.desired_slug ?? request.clinic_name);
      let clinicSlug = baseSlug;
      let counter = 2;
      while (true) {
        const slugExists = await client.query<{ id: string }>(
          `SELECT id FROM clinics WHERE slug = $1 LIMIT 1`,
          [clinicSlug]
        );
        if (!slugExists.rows[0]) break;
        clinicSlug = `${baseSlug.slice(0, Math.max(1, 61 - String(counter).length))}-${counter}`;
        counter += 1;
      }

      const ownerEmail = request.email.trim().toLowerCase();
      const loginConflict = await client.query<{ id: string }>(
        `SELECT id FROM auth_users WHERE login = $1 LIMIT 1`,
        [ownerEmail]
      );
      if (loginConflict.rows[0]) {
        throw new Error("OWNER_EMAIL_TAKEN");
      }

      const clinicRes = await client.query<{ id: string; slug: string }>(
        `INSERT INTO clinics (slug, name)
         VALUES ($1, $2)
         RETURNING id, slug`,
        [clinicSlug, request.clinic_name]
      );
      const clinic = clinicRes.rows[0]!;
      const ownerUserId = `auth-owner-${createHash("sha256")
        .update(`${clinic.id}:${ownerEmail}`)
        .digest("hex")
        .slice(0, 12)}`;

      await client.query(
        `INSERT INTO auth_users (id, clinic_id, login, password_hash, role, name)
         VALUES ($1, $2, $3, $4, 'owner', $5)`,
        [
          ownerUserId,
          clinic.id,
          ownerEmail,
          hashPassword(tempPassword),
          request.contact_name.trim() || "Владелец клиники",
        ]
      );

      const fresh = createFreshPersistedState();
      const snapshot = {
        ...fresh,
        clinicSettings: {
          ...fresh.clinicSettings,
          name: request.clinic_name,
        },
        _schemaVersion: 1,
      };
      await client.query(
        `INSERT INTO clinic_snapshots (clinic_id, data, version, updated_at)
         VALUES ($1, $2::jsonb, 1, NOW())
         ON CONFLICT (clinic_id) DO NOTHING`,
        [clinic.id, JSON.stringify(snapshot)]
      );

      await client.query(
        `UPDATE platform_connection_requests
            SET status = 'approved',
                clinic_id = $2,
                owner_user_id = $3,
                handled_by = $4,
                handled_at = NOW(),
                notes = COALESCE(notes, '') || CASE
                  WHEN COALESCE(notes, '') = '' THEN ''
                  ELSE E'\n'
                END || $5,
                updated_at = NOW()
          WHERE id = $1`,
        [
          request.id,
          clinic.id,
          ownerUserId,
          input.handledBy,
          `Автосоздание: логин ${ownerEmail}, временный пароль ${tempPassword}`,
        ]
      );

      await client.query("COMMIT");
      return {
        clinicId: clinic.id,
        clinicSlug: clinic.slug,
        ownerUserId,
        ownerEmail,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  if (!provisioned) throw new Error("DATABASE_URL не настроен");
  return {
    ...provisioned,
    tempPassword,
    loginUrl: clinicLoginUrl(provisioned.clinicSlug),
  };
}
