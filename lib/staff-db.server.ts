import "server-only";

import type { Doctor } from "@/lib/types";
import { withDb } from "@/lib/db";

function parseDoctor(raw: unknown): Doctor | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== "string" || typeof d.name !== "string") return null;
  if (typeof d.specialization !== "string" || typeof d.phone !== "string") return null;
  if (typeof d.email !== "string" || typeof d.role !== "string") return null;
  if (typeof d.cabinet !== "string" || typeof d.commissionPercent !== "number") return null;
  if (typeof d.status !== "string") return null;
  return raw as Doctor;
}

export async function listStaffDb(clinicId: string): Promise<Doctor[]> {
  const rows =
    (await withDb(async (client) => {
      const res = await client.query<{ data: unknown }>(
        `SELECT data FROM staff_members WHERE clinic_id = $1 ORDER BY updated_at DESC`,
        [clinicId]
      );
      return res.rows;
    })) ?? [];

  return rows.map((r) => parseDoctor(r.data)).filter((d): d is Doctor => d !== null);
}

export async function upsertStaffDb(clinicId: string, doctor: Doctor): Promise<Doctor> {
  const saved = await withDb(async (client) => {
    await client.query(
      `INSERT INTO staff_members (id, clinic_id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (clinic_id, id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = NOW()`,
      [doctor.id, clinicId, JSON.stringify(doctor)]
    );
    return doctor;
  });
  if (!saved) throw new Error("DATABASE_URL не настроен");
  return saved;
}

export async function deleteStaffDb(clinicId: string, staffId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(`DELETE FROM staff_members WHERE clinic_id = $1 AND id = $2`, [
      clinicId,
      staffId,
    ]);
  });
}
