import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { AuthAccountRecord } from "@/lib/auth-account-types";
import {
  findAuthUserByLogin,
  findAuthUserByUserIdDb,
  removeAuthUserByStaffIdDb,
  updateAuthUserProfileByUserIdDb,
  updateAuthUserProfileDb,
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

  const all = [...getSeedAuthAccounts(), ...readDynamicAccounts()];
  if (all.some((a) => a.login === login && a.id !== input.id)) {
    throw new Error("Этот email уже зарегистрирован в системе. Используйте другой адрес.");
  }

  const dynamic = readDynamicAccounts().filter((a) => a.login !== login && a.id !== input.id);
  dynamic.push(record);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(dynamic, null, 2), "utf8");
  return record;
}

export async function updateAuthAccountProfile(input: {
  clinicId?: string;
  staffId: string;
  login: string;
  role: UserRole;
  name: string;
}): Promise<AuthAccountRecord> {
  const login = input.login.trim().toLowerCase();
  if (!login) throw new Error("Укажите email для входа");

  if (isDatabaseEnabled()) {
    if (!input.clinicId) throw new Error("Не указана клиника");
    const updated = await updateAuthUserProfileDb({
      clinicId: input.clinicId,
      staffId: input.staffId,
      login,
      role: input.role,
      name: input.name,
    });
    if (!updated) {
      throw new Error("Учётная запись для входа не найдена. Задайте пароль в карточке сотрудника.");
    }
    return updated;
  }

  const dynamic = readDynamicAccounts();
  const idx = dynamic.findIndex((a) => a.staffId === input.staffId);
  if (idx < 0) {
    throw new Error("Учётная запись для входа не найдена. Задайте пароль в карточке сотрудника.");
  }
  if (getSeedAuthAccounts().some((a) => a.login === login)) {
    throw new Error("Этот email уже зарегистрирован в системе. Используйте другой адрес.");
  }
  if (dynamic.some((a, i) => i !== idx && a.login === login)) {
    throw new Error("Этот email уже зарегистрирован в системе. Используйте другой адрес.");
  }

  const prev = dynamic[idx]!;
  const record: AuthAccountRecord = {
    ...prev,
    login,
    role: input.role,
    name: input.name,
  };
  dynamic[idx] = record;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(dynamic, null, 2), "utf8");
  return record;
}

/** Обновление учётки текущего пользователя (имя, email, пароль). */
export async function updateAuthAccountByUserId(input: {
  userId: string;
  clinicId?: string;
  login: string;
  name: string;
  password?: string;
  currentPassword?: string;
}): Promise<AuthAccountRecord> {
  const login = input.login.trim().toLowerCase();
  if (!login) throw new Error("Укажите email для входа");
  if (!input.name.trim()) throw new Error("Укажите имя");

  if (isDatabaseEnabled()) {
    if (!input.clinicId) throw new Error("Не указана клиника");

    const existing = await findAuthUserByUserIdDb(input.clinicId, input.userId);
    if (!existing) throw new Error("Учётная запись не найдена");

    if (input.password?.trim()) {
      if (input.password.length < 8) {
        throw new Error("Новый пароль не менее 8 символов");
      }
      const current = input.currentPassword ?? "";
      if (!current) {
        throw new Error("Введите текущий пароль для смены");
      }
      if (!verifyAccountPassword(existing, current)) {
        throw new Error("Неверный текущий пароль");
      }
    }

    const updated = await updateAuthUserProfileByUserIdDb({
      clinicId: input.clinicId,
      userId: input.userId,
      login,
      name: input.name.trim(),
      passwordHash: input.password?.trim()
        ? hashPassword(input.password)
        : undefined,
    });
    if (!updated) throw new Error("Не удалось обновить учётную запись");
    return updated;
  }

  const seeds = getSeedAuthAccounts();
  const seed = seeds.find((a) => a.id === input.userId);
  if (seed) {
    throw new Error(
      "Демо-учётка: смените пароль через скрипт на сервере или войдите под учёткой из БД"
    );
  }

  const dynamic = readDynamicAccounts();
  const idx = dynamic.findIndex((a) => a.id === input.userId);
  if (idx < 0) throw new Error("Учётная запись не найдена");

  const prev = dynamic[idx]!;
  if (input.password?.trim()) {
    if (input.password.length < 8) {
      throw new Error("Новый пароль не менее 8 символов");
    }
    const current = input.currentPassword ?? "";
    if (!verifyAccountPassword(prev, current)) {
      throw new Error("Неверный текущий пароль");
    }
  }

  if (dynamic.some((a, i) => i !== idx && a.login === login)) {
    throw new Error("Этот email уже используется");
  }

  const record: AuthAccountRecord = {
    ...prev,
    login,
    name: input.name.trim(),
    passwordHash: input.password?.trim()
      ? hashPassword(input.password)
      : prev.passwordHash,
  };
  dynamic[idx] = record;
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
