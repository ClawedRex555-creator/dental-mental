import "server-only";

import type { AuthAccountRecord } from "@/lib/auth-account-types";
import { withDb } from "@/lib/db";
import type { UserRole } from "@/lib/types";

export function normalizeAuthLogin(login: string): string {
  return login.trim().toLowerCase();
}

export function authLoginTakenError(_clinicSlug: string): Error {
  return new Error("Этот email уже зарегистрирован в системе. Используйте другой адрес.");
}

/** Email занят другой учёткой (любая клиника) */
export async function findAuthLoginConflict(
  login: string,
  excludeUserId?: string
): Promise<{ userId: string; clinicSlug: string } | null> {
  const key = normalizeAuthLogin(login);
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ id: string; slug: string }>(
        `SELECT u.id, c.slug
         FROM auth_users u
         JOIN clinics c ON c.id = u.clinic_id
         WHERE u.login = $1 AND ($2::text IS NULL OR u.id <> $2)
         LIMIT 1`,
        [key, excludeUserId ?? null]
      );
      const row = res.rows[0];
      if (!row) return null;
      return { userId: row.id, clinicSlug: row.slug };
    })) ?? null
  );
}

async function assertAuthLoginAvailable(login: string, excludeUserId?: string): Promise<void> {
  const conflict = await findAuthLoginConflict(login, excludeUserId);
  if (conflict) throw authLoginTakenError(conflict.clinicSlug);
}

export interface ClinicRecord {
  id: string;
  slug: string;
  name: string;
}

export async function findClinicBySlug(slug: string): Promise<ClinicRecord | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ id: string; slug: string; name: string }>(
        `SELECT id, slug, name FROM clinics WHERE slug = $1 LIMIT 1`,
        [slug.toLowerCase()]
      );
      return res.rows[0] ?? null;
    })) ?? null
  );
}

export async function listClinics(): Promise<ClinicRecord[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<ClinicRecord>(
        `SELECT id, slug, name FROM clinics ORDER BY name ASC`
      );
      return res.rows;
    })) ?? []
  );
}

export async function createClinic(input: {
  slug: string;
  name: string;
}): Promise<ClinicRecord> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const created = await withDb(async (client) => {
    const res = await client.query<ClinicRecord>(
      `INSERT INTO clinics (slug, name) VALUES ($1, $2)
       RETURNING id, slug, name`,
      [slug, name]
    );
    return res.rows[0];
  });
  if (!created) throw new Error("DATABASE_URL не настроен");
  return created;
}

export async function findAuthUserByStaffIdDb(
  clinicId: string,
  staffId: string
): Promise<AuthAccountRecord | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        login: string;
        password_hash: string;
        role: UserRole;
        name: string;
        staff_id: string | null;
        clinic_id: string;
        session_version: number | string | null;
      }>(
        `SELECT id, login, password_hash, role, name, staff_id, clinic_id, session_version
         FROM auth_users WHERE clinic_id = $1 AND staff_id = $2 LIMIT 1`,
        [clinicId, staffId]
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        clinicId: row.clinic_id,
        login: row.login,
        passwordHash: row.password_hash,
        role: row.role,
        name: row.name,
        staffId: row.staff_id ?? undefined,
        sessionVersion: Number(row.session_version ?? 0),
      };
    })) ?? null
  );
}

export async function findAuthUserByUserIdDb(
  clinicId: string,
  userId: string
): Promise<AuthAccountRecord | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        login: string;
        password_hash: string;
        role: UserRole;
        name: string;
        staff_id: string | null;
        clinic_id: string;
        session_version: number | string | null;
      }>(
        `SELECT id, login, password_hash, role, name, staff_id, clinic_id, session_version
         FROM auth_users WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
        [clinicId, userId]
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        clinicId: row.clinic_id,
        login: row.login,
        passwordHash: row.password_hash,
        role: row.role,
        name: row.name,
        staffId: row.staff_id ?? undefined,
        sessionVersion: Number(row.session_version ?? 0),
      };
    })) ?? null
  );
}

export async function updateAuthUserProfileDb(input: {
  clinicId: string;
  staffId: string;
  login: string;
  role: UserRole;
  name: string;
}): Promise<AuthAccountRecord | null> {
  const login = normalizeAuthLogin(input.login);
  const updated = await withDb(async (client) => {
    const existing = await client.query<{ id: string; password_hash: string }>(
      `SELECT id, password_hash FROM auth_users
       WHERE clinic_id = $1 AND staff_id = $2 LIMIT 1`,
      [input.clinicId, input.staffId]
    );
    const row = existing.rows[0];
    if (!row) return null;

    await assertAuthLoginAvailable(login, row.id);

    await client.query(
      `UPDATE auth_users SET login = $1, role = $2, name = $3
       WHERE clinic_id = $4 AND staff_id = $5`,
      [login, input.role, input.name, input.clinicId, input.staffId]
    );

    return {
      id: row.id,
      clinicId: input.clinicId,
      login,
      passwordHash: row.password_hash,
      role: input.role,
      name: input.name,
      staffId: input.staffId,
    };
  });
  return updated ?? null;
}

/** Обновление своего профиля (владелец без staff_id или любой пользователь по id). */
export async function updateAuthUserProfileByUserIdDb(input: {
  clinicId: string;
  userId: string;
  login: string;
  name: string;
  passwordHash?: string;
}): Promise<AuthAccountRecord | null> {
  const login = normalizeAuthLogin(input.login);
  const updated = await withDb(async (client) => {
    const existing = await client.query<{
      id: string;
      password_hash: string;
      role: UserRole;
      staff_id: string | null;
    }>(
      `SELECT id, password_hash, role, staff_id FROM auth_users
       WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
      [input.clinicId, input.userId]
    );
    const row = existing.rows[0];
    if (!row) return null;

    await assertAuthLoginAvailable(login, row.id);

    const passwordHash = input.passwordHash ?? row.password_hash;
    await client.query(
      `UPDATE auth_users SET login = $1, name = $2, password_hash = $3
       WHERE clinic_id = $4 AND id = $5`,
      [login, input.name, passwordHash, input.clinicId, input.userId]
    );

    return {
      id: row.id,
      clinicId: input.clinicId,
      login,
      passwordHash,
      role: row.role,
      name: input.name,
      staffId: row.staff_id ?? undefined,
    };
  });
  return updated ?? null;
}

export async function findAuthUserByLogin(
  clinicId: string,
  login: string
): Promise<AuthAccountRecord | null> {
  const key = login.trim().toLowerCase();
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        login: string;
        password_hash: string;
        role: UserRole;
        name: string;
        staff_id: string | null;
        clinic_id: string;
        session_version: number | string | null;
      }>(
        `SELECT id, login, password_hash, role, name, staff_id, clinic_id, session_version
         FROM auth_users WHERE clinic_id = $1 AND login = $2 LIMIT 1`,
        [clinicId, key]
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        clinicId: row.clinic_id,
        login: row.login,
        passwordHash: row.password_hash,
        role: row.role,
        name: row.name,
        staffId: row.staff_id ?? undefined,
        sessionVersion: Number(row.session_version ?? 0),
      };
    })) ?? null
  );
}

export async function upsertAuthUserDb(input: {
  id: string;
  clinicId: string;
  login: string;
  passwordHash: string;
  role: UserRole;
  name: string;
  staffId?: string;
}): Promise<AuthAccountRecord> {
  const login = normalizeAuthLogin(input.login);
  await assertAuthLoginAvailable(login, input.id);
  const saved = await withDb(async (client) => {
    await client.query(
      `DELETE FROM auth_users WHERE clinic_id = $1 AND (login = $2 OR id = $3)`,
      [input.clinicId, login, input.id]
    );
    await client.query(
      `INSERT INTO auth_users (id, clinic_id, login, password_hash, role, name, staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        input.clinicId,
        login,
        input.passwordHash,
        input.role,
        input.name,
        input.staffId ?? null,
      ]
    );
    return {
      id: input.id,
      clinicId: input.clinicId,
      login,
      passwordHash: input.passwordHash,
      role: input.role,
      name: input.name,
      staffId: input.staffId,
    };
  });
  if (!saved) throw new Error("DATABASE_URL не настроен");
  return saved;
}

export async function removeAuthUserByStaffIdDb(
  clinicId: string,
  staffId: string
): Promise<void> {
  await withDb(async (client) => {
    await client.query(`DELETE FROM auth_users WHERE clinic_id = $1 AND staff_id = $2`, [
      clinicId,
      staffId,
    ]);
  });
}

export async function bumpAuthSessionVersionByUserIdDb(
  clinicId: string,
  userId: string
): Promise<number | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ session_version: number | string }>(
        `UPDATE auth_users
           SET session_version = COALESCE(session_version, 0) + 1
         WHERE clinic_id = $1 AND id = $2
         RETURNING session_version`,
        [clinicId, userId]
      );
      const row = res.rows[0];
      return row ? Number(row.session_version) : null;
    })) ?? null
  );
}
