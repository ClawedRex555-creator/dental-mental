import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { AuthAccountRecord } from "@/lib/auth-account-types";
import { getSeedAuthAccounts } from "@/lib/seed-auth-accounts.server";
import { hashPassword, verifyPassword } from "@/lib/auth-password";
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

export function findAccountByLogin(login: string): AuthAccountRecord | undefined {
  const key = login.trim().toLowerCase();
  return getAllAuthAccounts().find((a) => a.login === key);
}

export function verifyAccountPassword(
  account: AuthAccountRecord,
  password: string
): boolean {
  return verifyPassword(password, account.passwordHash);
}

export function upsertAuthAccount(input: {
  id: string;
  login: string;
  password: string;
  role: UserRole;
  name: string;
  staffId?: string;
}): AuthAccountRecord {
  const login = input.login.trim().toLowerCase();
  if (!login) throw new Error("Укажите email для входа");

  const seeded = getSeedAuthAccounts().some((a) => a.login === login);
  if (seeded) throw new Error("Этот логин зарезервирован системой");

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

export function removeAuthAccountByStaffId(staffId: string): void {
  const dynamic = readDynamicAccounts().filter((a) => a.staffId !== staffId);
  if (!existsSync(DATA_DIR)) return;
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(dynamic, null, 2), "utf8");
}
