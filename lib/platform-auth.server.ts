import "server-only";

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { withDb } from "@/lib/db";

export interface PlatformAdminRecord {
  id: string;
  login: string;
  name: string;
  active: boolean;
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPlatformPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPlatformPassword(stored: string, password: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const actual = scryptSync(password, salt, 64, SCRYPT_PARAMS);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function findPlatformAdminByLogin(
  login: string
): Promise<(PlatformAdminRecord & { passwordHash: string }) | null> {
  const key = login.trim().toLowerCase();
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        login: string;
        name: string;
        active: boolean;
        password_hash: string;
      }>(
        `SELECT id, login, name, active, password_hash FROM platform_admins
         WHERE login = $1 AND active = TRUE LIMIT 1`,
        [key]
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        login: row.login,
        name: row.name,
        active: row.active,
        passwordHash: row.password_hash,
      };
    })) ?? null
  );
}

export async function upsertPlatformAdmin(input: {
  id: string;
  login: string;
  name: string;
  password: string;
}): Promise<PlatformAdminRecord> {
  const login = input.login.trim().toLowerCase();
  const hash = hashPlatformPassword(input.password);
  const saved = await withDb(async (client) => {
    await client.query(
      `INSERT INTO platform_admins (id, login, password_hash, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (login) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, active = TRUE`,
      [input.id, login, hash, input.name]
    );
    const res = await client.query<PlatformAdminRecord>(
      `SELECT id, login, name, active FROM platform_admins WHERE login = $1`,
      [login]
    );
    return res.rows[0];
  });
  if (!saved) throw new Error("DATABASE_URL не настроен");
  return saved;
}

/** Bootstrap из env (SUPERADMIN_LOGIN + SUPERADMIN_PASSWORD) если таблица пуста */
export async function ensureBootstrapSuperAdmin(): Promise<void> {
  const login = process.env.SUPERADMIN_LOGIN?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();
  if (!login || !password) return;

  await withDb(async (client) => {
    const count = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM platform_admins`
    );
    if (Number(count.rows[0]?.c ?? 0) > 0) return;
    const id = `pa_${createHash("sha256").update(login).digest("hex").slice(0, 12)}`;
    const hash = hashPlatformPassword(password);
    await client.query(
      `INSERT INTO platform_admins (id, login, password_hash, name)
       VALUES ($1, $2, $3, $4) ON CONFLICT (login) DO NOTHING`,
      [id, login, hash, "Супер-администратор"]
    );
  });
}
