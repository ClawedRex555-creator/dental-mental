import "server-only";

import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { verifyMobileAccessToken } from "@/lib/mobile-auth";
import type { MobileTokenPayload } from "@/lib/mobile-auth-token";
import { getMobilePatientSessionVersion } from "@/lib/mobile-patient-db.server";

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function requireMobileSession(request: Request): MobileTokenPayload | null {
  return verifyMobileAccessToken(readBearerToken(request));
}

/**
 * Проверка HMAC + sessionVersion в БД (revoke при смене пароля/роли).
 * Токены без sessionVersion (legacy) принимаются до истечения TTL.
 */
export async function requireMobileSessionAsync(
  request: Request
): Promise<MobileTokenPayload | null> {
  const session = verifyMobileAccessToken(readBearerToken(request));
  if (!session) return null;

  if (session.sessionVersion == null) return session;

  if (session.kind === "staff") {
    const account = await findAuthUserByUserIdDb(session.clinicId, session.userId);
    if (!account) return null;
    const current = account.sessionVersion ?? 0;
    if (current !== session.sessionVersion) return null;
    // Роль из БД важнее cookie/token claim
    return { ...session, role: account.role, staffId: account.staffId ?? session.staffId };
  }

  const patientVersion = await getMobilePatientSessionVersion(
    session.clinicId,
    session.userId
  );
  if (patientVersion == null) return null;
  if (patientVersion !== session.sessionVersion) return null;
  return session;
}
