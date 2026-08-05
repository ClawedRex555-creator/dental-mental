import "server-only";

import { findAccountByLogin, verifyAccountPassword } from "@/lib/auth-accounts-server";
import { createMobileAccessToken, MOBILE_ACCESS_TOKEN_HOURS } from "@/lib/mobile-auth";
import type { MobileTokenPayload } from "@/lib/mobile-auth-token";
import {
  findMobilePatientByLogin,
  verifyMobilePatientPassword,
  type MobilePatientAccount,
} from "@/lib/mobile-patient-db.server";
import type { AuthAccountRecord } from "@/lib/auth-account-types";

export interface MobileAuthUser {
  id: string;
  name: string;
  email: string;
  role: MobileTokenPayload["role"];
  kind: MobileTokenPayload["kind"];
  clinicId: string;
  clinicSlug: string;
  patientId?: string;
  staffId?: string;
}

export interface MobileAuthResult {
  accessToken: string;
  expiresAt: number;
  user: MobileAuthUser;
}

const MOBILE_TOKEN_HOURS = MOBILE_ACCESS_TOKEN_HOURS;

function staffToUser(
  account: AuthAccountRecord,
  clinicId: string,
  clinicSlug: string
): MobileAuthUser {
  return {
    id: account.id,
    name: account.name,
    email: account.login,
    role: account.role,
    kind: "staff",
    clinicId,
    clinicSlug,
    staffId: account.staffId,
  };
}

function patientToUser(
  account: MobilePatientAccount,
  clinicSlug: string
): MobileAuthUser {
  return {
    id: account.id,
    name: account.fullName,
    email: account.login,
    role: "patient",
    kind: "patient",
    clinicId: account.clinicId,
    clinicSlug,
    patientId: account.patientId,
  };
}

function staffAuthResult(
  account: AuthAccountRecord,
  clinicId: string,
  clinicSlug: string
): MobileAuthResult {
  const user = staffToUser(account, clinicId, clinicSlug);
  const tokenPayload: Omit<MobileTokenPayload, "exp"> = {
    kind: "staff",
    userId: user.id,
    role: account.role,
    name: user.name,
    email: user.email,
    clinicId,
    clinicSlug,
    staffId: account.staffId,
    sessionVersion: account.sessionVersion ?? 0,
  };
  return {
    accessToken: createMobileAccessToken(tokenPayload, MOBILE_TOKEN_HOURS),
    expiresAt: Date.now() + MOBILE_TOKEN_HOURS * 60 * 60 * 1000,
    user,
  };
}

function patientAuthResult(
  account: MobilePatientAccount,
  clinicSlug: string
): MobileAuthResult {
  const user = patientToUser(account, clinicSlug);
  const tokenPayload: Omit<MobileTokenPayload, "exp"> = {
    kind: "patient",
    userId: user.id,
    role: "patient",
    name: user.name,
    email: user.email,
    clinicId: account.clinicId,
    clinicSlug,
    patientId: account.patientId,
    sessionVersion: account.sessionVersion ?? 0,
  };
  return {
    accessToken: createMobileAccessToken(tokenPayload, MOBILE_TOKEN_HOURS),
    expiresAt: Date.now() + MOBILE_TOKEN_HOURS * 60 * 60 * 1000,
    user,
  };
}

export async function loginMobileUser(input: {
  clinicId: string;
  clinicSlug: string;
  login: string;
  password: string;
  /** patient — сначала пациент (вход из приложения пациента); staff — сначала сотрудник */
  preferredKind?: "patient" | "staff";
}): Promise<MobileAuthResult | null> {
  const login = input.login.trim().toLowerCase();
  const password = input.password;
  const preferred = input.preferredKind ?? "staff";

  const tryStaff = async (): Promise<MobileAuthResult | null> => {
    const staff = await findAccountByLogin(login, input.clinicId);
    if (staff && verifyAccountPassword(staff, password)) {
      return staffAuthResult(staff, input.clinicId, input.clinicSlug);
    }
    return null;
  };

  const tryPatient = async (): Promise<MobileAuthResult | null> => {
    const patient = await findMobilePatientByLogin(input.clinicId, login);
    if (patient && verifyMobilePatientPassword(patient, password)) {
      return patientAuthResult(patient, input.clinicSlug);
    }
    return null;
  };

  if (preferred === "patient") {
    return (await tryPatient()) ?? (await tryStaff());
  }
  return (await tryStaff()) ?? (await tryPatient());
}

export function mobileAuthFromPatient(
  account: MobilePatientAccount,
  clinicSlug: string
): MobileAuthResult {
  return patientAuthResult(account, clinicSlug);
}
