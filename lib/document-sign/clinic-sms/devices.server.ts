import "server-only";

import { withDb } from "@/lib/db";
import {
  secureRandomToken,
  sha256Hex,
} from "@/lib/document-sign/clinic-sms/crypto";
import { evaluatePairingChallenge } from "@/lib/document-sign/clinic-sms/rules";
import type { ClinicSignSenderDevice } from "@/lib/document-sign/clinic-sms/types";

const PAIRING_TTL_MS = 5 * 60 * 1000;

interface DeviceRow {
  id: string;
  clinic_id: string;
  display_name: string;
  declared_phone_number: string | null;
  device_name: string | null;
  platform: string | null;
  paired_at: Date;
  paired_by_user_id: string | null;
  last_seen_at: Date | null;
  status: string;
  is_primary: boolean;
}

function mapDevice(r: DeviceRow): ClinicSignSenderDevice {
  return {
    id: r.id,
    clinicId: r.clinic_id,
    displayName: r.display_name,
    declaredPhoneNumber: r.declared_phone_number ?? undefined,
    deviceName: r.device_name ?? undefined,
    platform: r.platform ?? undefined,
    pairedAt: r.paired_at.toISOString(),
    pairedByUserId: r.paired_by_user_id ?? undefined,
    lastSeenAt: r.last_seen_at?.toISOString(),
    status: r.status as ClinicSignSenderDevice["status"],
    isPrimary: r.is_primary,
  };
}

export async function listClinicSenderDevices(
  clinicId: string
): Promise<ClinicSignSenderDevice[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<DeviceRow>(
        `SELECT * FROM clinic_sign_sender_devices
         WHERE clinic_id = $1 AND status = 'active'
         ORDER BY is_primary DESC, paired_at DESC`,
        [clinicId]
      );
      return res.rows.map(mapDevice);
    })) ?? []
  );
}

export async function createPairingChallenge(input: {
  clinicId: string;
  createdByUserId?: string;
}): Promise<{
  pairingId: string;
  token: string;
  shortCode: string;
  expiresAt: string;
  qrPayload: string;
}> {
  const token = secureRandomToken(32);
  const tokenHash = sha256Hex(token);
  const shortCode = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  const row = await withDb(async (client) => {
    await client.query(
      `UPDATE clinic_sign_pairing_tokens SET used_at = NOW()
       WHERE clinic_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [input.clinicId]
    );
    const res = await client.query<{ id: string }>(
      `INSERT INTO clinic_sign_pairing_tokens
        (clinic_id, token_hash, short_code, created_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.clinicId, tokenHash, shortCode, input.createdByUserId ?? null, expiresAt]
    );
    return res.rows[0];
  });

  if (!row) throw new Error("Не удалось создать код привязки");

  return {
    pairingId: row.id,
    token,
    shortCode,
    expiresAt: expiresAt.toISOString(),
    qrPayload: JSON.stringify({
      v: 1,
      clinicId: input.clinicId,
      token,
      code: shortCode,
      exp: expiresAt.toISOString(),
    }),
  };
}

export async function completePairing(input: {
  token?: string;
  shortCode?: string;
  clinicIdHint?: string;
  displayName?: string;
  declaredPhoneNumber?: string;
  deviceName?: string;
  platform?: string;
}): Promise<{ deviceId: string; deviceToken: string; clinicId: string } | { error: string; status: number }> {
  const tokenHash = input.token ? sha256Hex(input.token) : null;
  const shortCode = input.shortCode?.trim();

  const challenge = await withDb(async (client) => {
    if (tokenHash) {
      const res = await client.query<{
        id: string;
        clinic_id: string;
        expires_at: Date;
        used_at: Date | null;
      }>(
        `SELECT id, clinic_id, expires_at, used_at FROM clinic_sign_pairing_tokens
         WHERE token_hash = $1 LIMIT 1`,
        [tokenHash]
      );
      return res.rows[0] ?? null;
    }
    if (shortCode && input.clinicIdHint) {
      const res = await client.query<{
        id: string;
        clinic_id: string;
        expires_at: Date;
        used_at: Date | null;
      }>(
        `SELECT id, clinic_id, expires_at, used_at FROM clinic_sign_pairing_tokens
         WHERE clinic_id = $1 AND short_code = $2 AND used_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [input.clinicIdHint, shortCode]
      );
      return res.rows[0] ?? null;
    }
    if (shortCode) {
      const res = await client.query<{
        id: string;
        clinic_id: string;
        expires_at: Date;
        used_at: Date | null;
      }>(
        `SELECT id, clinic_id, expires_at, used_at FROM clinic_sign_pairing_tokens
         WHERE short_code = $1 AND used_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [shortCode]
      );
      return res.rows[0] ?? null;
    }
    return null;
  });

  if (!challenge) {
    return { error: "Код привязки не найден", status: 404 };
  }

  const evaluated = evaluatePairingChallenge({
    usedAt: challenge.used_at?.toISOString() ?? null,
    expiresAt: challenge.expires_at.toISOString(),
  });
  if (!evaluated.ok) {
    return { error: evaluated.error, status: evaluated.status };
  }

  const deviceToken = secureRandomToken(32);
  const deviceTokenHash = sha256Hex(deviceToken);

  const device = await withDb(async (client) => {
    await client.query(
      `UPDATE clinic_sign_pairing_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL`,
      [challenge.id]
    );
    const hasPrimary = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM clinic_sign_sender_devices
       WHERE clinic_id = $1 AND status = 'active' AND is_primary = true`,
      [challenge.clinic_id]
    );
    const isPrimary = (hasPrimary.rows[0]?.c ?? "0") === "0";
    const res = await client.query<{ id: string }>(
      `INSERT INTO clinic_sign_sender_devices
        (clinic_id, display_name, declared_phone_number, device_token_hash,
         device_name, platform, is_primary, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id`,
      [
        challenge.clinic_id,
        input.displayName?.trim() || "Телефон клиники",
        input.declaredPhoneNumber?.trim() || null,
        deviceTokenHash,
        input.deviceName?.trim() || null,
        input.platform?.trim() || null,
        isPrimary,
      ]
    );
    return res.rows[0];
  });

  if (!device) return { error: "Не удалось привязать устройство", status: 500 };

  return {
    deviceId: device.id,
    deviceToken,
    clinicId: challenge.clinic_id,
  };
}

export async function resolveDeviceByToken(
  deviceToken: string
): Promise<{ deviceId: string; clinicId: string } | null> {
  const hash = sha256Hex(deviceToken);
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ id: string; clinic_id: string }>(
        `UPDATE clinic_sign_sender_devices
         SET last_seen_at = NOW(), updated_at = NOW()
         WHERE device_token_hash = $1 AND status = 'active'
         RETURNING id, clinic_id`,
        [hash]
      );
      const row = res.rows[0];
      return row ? { deviceId: row.id, clinicId: row.clinic_id } : null;
    })) ?? null
  );
}

export async function revokeDevice(clinicId: string, deviceId: string): Promise<boolean> {
  const ok = await withDb(async (client) => {
    const res = await client.query(
      `UPDATE clinic_sign_sender_devices
       SET status = 'revoked', updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2 AND status = 'active'`,
      [deviceId, clinicId]
    );
    return (res.rowCount ?? 0) > 0;
  });
  return Boolean(ok);
}

export async function getPrimaryDeviceId(clinicId: string): Promise<string | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM clinic_sign_sender_devices
         WHERE clinic_id = $1 AND status = 'active'
         ORDER BY is_primary DESC, last_seen_at DESC NULLS LAST, paired_at DESC
         LIMIT 1`,
        [clinicId]
      );
      return res.rows[0]?.id ?? null;
    })) ?? null
  );
}
