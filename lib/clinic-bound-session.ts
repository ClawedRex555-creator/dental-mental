import type { SessionPayload } from "@/lib/auth-session";

/** Сессия с гарантированным clinicId (после проверки в API route). */
export type ClinicBoundSession = SessionPayload & { clinicId: string };

export function asClinicBoundSession(
  session: SessionPayload | null | undefined
): ClinicBoundSession | null {
  if (!session?.clinicId) return null;
  return { ...session, clinicId: session.clinicId };
}
