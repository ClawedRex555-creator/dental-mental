import "server-only";

import { normalizeAuthLogin, findAuthLoginConflict } from "@/lib/clinic-db.server";
import { hashPassword, verifyPassword } from "@/lib/auth-password";
import { withDb } from "@/lib/db";
import { generateId } from "@/lib/utils";
import type { Patient } from "@/lib/types";
import {
  getClinicDataDbWithLegacyStaff,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import { createFreshPersistedState } from "@/lib/clinic-persisted-state";

export interface MobilePatientAccount {
  id: string;
  clinicId: string;
  login: string;
  passwordHash: string;
  patientId: string;
  fullName: string;
  phone: string;
  fcmToken?: string;
}

export async function findMobilePatientByLogin(
  clinicId: string,
  login: string
): Promise<MobilePatientAccount | null> {
  const key = normalizeAuthLogin(login);
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        clinic_id: string;
        login: string;
        password_hash: string;
        patient_id: string;
        full_name: string;
        phone: string;
        fcm_token: string | null;
      }>(
        `SELECT id, clinic_id, login, password_hash, patient_id, full_name, phone, fcm_token
         FROM mobile_patient_accounts
         WHERE clinic_id = $1 AND login = $2
         LIMIT 1`,
        [clinicId, key]
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        clinicId: row.clinic_id,
        login: row.login,
        passwordHash: row.password_hash,
        patientId: row.patient_id,
        fullName: row.full_name,
        phone: row.phone,
        fcmToken: row.fcm_token ?? undefined,
      };
    })) ?? null
  );
}

export function verifyMobilePatientPassword(
  account: MobilePatientAccount,
  password: string
): boolean {
  return verifyPassword(password, account.passwordHash);
}

function splitFullName(fullName: string): {
  lastName: string;
  firstName: string;
  middleName?: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { lastName: "Пациент", firstName: "" };
  if (parts.length === 1) return { lastName: parts[0], firstName: "" };
  if (parts.length === 2) return { lastName: parts[0], firstName: parts[1] };
  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(" "),
  };
}

export async function registerMobilePatient(input: {
  clinicId: string;
  login: string;
  password: string;
  fullName: string;
  phone: string;
  birthDate: string;
}): Promise<MobilePatientAccount> {
  const login = normalizeAuthLogin(input.login);
  if (!login || !input.password.trim()) {
    throw new Error("Укажите email и пароль");
  }

  const staffConflict = await findAuthLoginConflict(login);
  if (staffConflict) {
    throw new Error("Этот email уже используется для входа сотрудника");
  }

  const existing = await findMobilePatientByLogin(input.clinicId, login);
  if (existing) {
    throw new Error("Пациент с таким email уже зарегистрирован");
  }

  const globalConflict = await withDb(async (client) => {
    const res = await client.query<{ id: string }>(
      `SELECT id FROM mobile_patient_accounts WHERE login = $1 LIMIT 1`,
      [login]
    );
    return res.rows[0] ?? null;
  });
  if (globalConflict) {
    throw new Error("Этот email уже зарегистрирован в приложении");
  }

  const patientId = generateId("pat");
  const accountId = generateId("mpa");
  const { lastName, firstName, middleName } = splitFullName(input.fullName);
  const now = new Date().toISOString();

  const patient: Patient = {
    id: patientId,
    lastName,
    firstName,
    middleName,
    phone: input.phone.trim(),
    email: login,
    birthDate: input.birthDate,
    gender: "female",
    source: "Сайт",
    status: "new",
    createdAt: now,
    balance: 0,
    totalSpent: 0,
    disability: "none",
  };

  const record = await getClinicDataDbWithLegacyStaff(input.clinicId);
  const base = record?.data ?? createFreshPersistedState();
  await saveClinicDataDb(
    input.clinicId,
    {
      ...base,
      patients: [...base.patients.filter((p) => p.id !== patientId), patient],
    },
    { allowEmptyResult: true }
  );

  const passwordHash = hashPassword(input.password);
  const created = await withDb(async (client) => {
    await client.query(
      `INSERT INTO mobile_patient_accounts
         (id, clinic_id, login, password_hash, patient_id, full_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        accountId,
        input.clinicId,
        login,
        passwordHash,
        patientId,
        input.fullName.trim(),
        input.phone.trim(),
      ]
    );
    return {
      id: accountId,
      clinicId: input.clinicId,
      login,
      passwordHash,
      patientId,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
    } satisfies MobilePatientAccount;
  });

  if (!created) throw new Error("DATABASE_URL не настроен");
  return created;
}
