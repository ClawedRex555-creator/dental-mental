import "server-only";

import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/auth-session";

/** Чтение сессии из cookie в Route Handlers (Next.js 15+) */
export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(AUTH_COOKIE)?.value);
}

export async function requireSuperAdminSession(): Promise<SessionPayload | null> {
  const session = await getServerSession();
  if (!session?.isSuperAdmin) return null;
  return session;
}
