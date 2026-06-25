import "server-only";

import { findAccountByLogin, verifyAccountPassword } from "@/lib/auth-accounts-server";
import { createMobileAccessToken } from "@/lib/mobile-auth";
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

const MOBILE_TOKEN_DAYS = 30;

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

export async function loginMobileUser(input: {
  clinicId: string;
  clinicSlug: string;
  login: string;
  password: string;
}): Promise<MobileAuthResult | null> {
  const login = input.login.trim().toLowerCase();
  const password = input.password;

  const staff = await findAccountByLogin(login, input.clinicId);
  if (staff && verifyAccountPassword(staff, password)) {
    const user = staffToUser(staff, input.clinicId, input.clinicSlug);
    const tokenPayload: Omit<MobileTokenPayload, "exp"> = {
      kind: "staff",
      userId: user.id,
      role: staff.role,
      name: user.name,
      email: user.email,
      clinicId: input.clinicId,
      clinicSlug: input.clinicSlug,
      staffId: staff.staffId,
    };
    const accessToken = createMobileAccessToken(tokenPayload, MOBILE_TOKEN_DAYS);
    return {
      accessToken,
      expiresAt: Date.now() + MOBILE_TOKEN_DAYS * 24 * 60 * 60 * 1000,
      user,
    };
  }

  const patient = await findMobilePatientByLogin(input.clinicId, login);
  if (patient && verifyMobilePatientPassword(patient, password)) {
    const user = patientToUser(patient, input.clinicSlug);
    const tokenPayload: Omit<MobileTokenPayload, "exp"> = {
      kind: "patient",
      userId: user.id,
      role: "patient",
      name: user.name,
      email: user.email,
      clinicId: input.clinicId,
      clinicSlug: input.clinicSlug,
      patientId: patient.patientId,
    };
    const accessToken = createMobileAccessToken(tokenPayload, MOBILE_TOKEN_DAYS);
    return {
      accessToken,
      expiresAt: Date.now() + MOBILE_TOKEN_DAYS * 24 * 60 * 60 * 1000,
      user,
    };
  }

  return null;
}

export function mobileAuthFromPatient(
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
  };
  const accessToken = createMobileAccessToken(tokenPayload, MOBILE_TOKEN_DAYS);
  return {
    accessToken,
    expiresAt: Date.now() + MOBILE_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    user,
  };
}
