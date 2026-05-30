import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { AuthAccountRecord } from "@/lib/auth-account-types";
import {
  findAuthUserByLogin,
  removeAuthUserByStaffIdDb,
  upsertAuthUserDb,
} from "@/lib/clinic-db.server";
import { getSeedAuthAccounts } from "@/lib/seed-auth-accounts.server";
import { hashPassword, verifyPassword } from "@/lib/auth-password";
import { isDatabaseEnabled } from "@/lib/db";
import type { UserRole } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "auth-accounts.json");

function readDynamicAccounts(): AuthAccountRecord[] {
  if (!existsSync(ACCOUNTS_FILE)) return [];
  try {
    const raw = readFileSync(ACCOUNTS_FILE, "utf8");
    const parsed = JSON.parse(raw) as AuthAccountRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAllAuthAccounts(): AuthAccountRecord[] {
  const map = new Map<string, AuthAccountRecord>();
  for (const a of getSeedAuthAccounts()) map.set(a.login, a);
  for (const a of readDynamicAccounts()) map.set(a.login, a);
  return [...map.values()];
}

/** Поиск учётки: в БД — в рамках клиники, иначе — файловый fallback (dev) */
export async function findAccountByLogin(
  login: string,
  clinicId?: string
): Promise<AuthAccountRecord | undefined> {
  const key = login.trim().toLowerCase();

  if (isDatabaseEnabled() && clinicId) {
    const dbUser = await findAuthUserByLogin(clinicId, key);
    return dbUser ?? undefined;
  }

  return getAllAuthAccounts().find((a) => a.login === key);
}

export function verifyAccountPassword(
  account: AuthAccountRecord,
  password: string
): boolean {
  return verifyPassword(password, account.passwordHash);
}

export async function upsertAuthAccount(input: {
  id: string;
  clinicId?: string;
  login: string;
  password: string;
  role: UserRole;
  name: string;
  staffId?: string;
}): Promise<AuthAccountRecord> {
  const login = input.login.trim().toLowerCase();
  if (!login) throw new Error("Укажите email для входа");

  const seeded = getSeedAuthAccounts().some((a) => a.login === login);
  if (seeded) throw new Error("Этот логин зарезервирован системой");

  if (isDatabaseEnabled()) {
    if (!input.clinicId) throw new Error("Не указана клиника");
    return upsertAuthUserDb({
      id: input.id,
      clinicId: input.clinicId,
      login,
      passwordHash: hashPassword(input.password),
      role: input.role,
      name: input.name,
      staffId: input.staffId,
    });
  }

  const record: AuthAccountRecord = {
    id: input.id,
    login,
    passwordHash: hashPassword(input.password),
    role: input.role,
    name: input.name,
    staffId: input.staffId,
  };

  const dynamic = readDynamicAccounts().filter((a) => a.login !== login && a.id !== input.id);
  dynamic.push(record);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(dynamic, null, 2), "utf8");
  return record;
}

export async function removeAuthAccountByStaffId(
  staffId: string,
  clinicId?: string
): Promise<void> {
  if (isDatabaseEnabled() && clinicId) {
    await removeAuthUserByStaffIdDb(clinicId, staffId);
    return;
  }

  const dynamic = readDynamicAccounts().filter((a) => a.staffId !== staffId);
  if (!existsSync(DATA_DIR)) return;
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(dynamic, null, 2), "utf8");
}
