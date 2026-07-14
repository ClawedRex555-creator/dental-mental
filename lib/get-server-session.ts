import "server-only";

import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/auth-session";
import { findAuthUserByUserIdDb } from "@/lib/clinic-db.server";
import { isDatabaseEnabled } from "@/lib/db";

/** Чтение сессии из cookie в Route Handlers (Next.js 15+) */
export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const session = verifySessionToken(store.get(AUTH_COOKIE)?.value);
  if (!session) return null;

  if (isDatabaseEnabled() && session.clinicId) {
    const authUser = await findAuthUserByUserIdDb(session.clinicId, session.userId);
    if (!authUser) return null;
    const currentSessionVersion = authUser.sessionVersion ?? 0;
    if (
      typeof session.sessionVersion !== "number" ||
      session.sessionVersion !== currentSessionVersion
    ) {
      return null;
    }
  }

  return session;
}

export async function requireSuperAdminSession(): Promise<SessionPayload | null> {
  const session = await getServerSession();
  if (!session?.isSuperAdmin) return null;
  return session;
}
