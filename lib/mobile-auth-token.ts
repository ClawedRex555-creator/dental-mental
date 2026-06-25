import { readAuthSecretEnv } from "./auth-env";
import type { UserRole } from "./types";

export type MobileAccountKind = "patient" | "staff";

export interface MobileTokenPayload {
  kind: MobileAccountKind;
  userId: string;
  role: UserRole | "patient";
  name: string;
  email: string;
  clinicId: string;
  clinicSlug: string;
  patientId?: string;
  staffId?: string;
  exp: number;
}

export function resolveMobileAuthSecret(): string {
  const fromEnv = readAuthSecretEnv();
  if (fromEnv) return `${fromEnv}:mobile`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return "dentalcloud-mis-dev-secret-change-in-production:mobile";
}

export function validateMobileTokenPayload(parsed: unknown): MobileTokenPayload | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as MobileTokenPayload;
  if (!p.exp || p.exp < Date.now()) return null;
  if (!p.userId || !p.name || !p.email || !p.clinicId || !p.clinicSlug) return null;
  if (p.kind !== "patient" && p.kind !== "staff") return null;
  if (!p.role) return null;
  if (p.kind === "patient" && !p.patientId) return null;
  return p;
}
