import { NextResponse } from "next/server";
import type { SessionTokenPayload } from "@/lib/auth-session-token";
import { clinicSlugMismatch } from "@/lib/clinic-host";

/**
 * Defense-in-depth: session clinicSlug must match request Host subdomain.
 * Returns a 403 response when mismatched, or null when OK.
 */
export function assertClinicHost(
  session: SessionTokenPayload | null | undefined,
  request: Request
): NextResponse | null {
  if (!session?.clinicSlug) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const host = request.headers.get("host");
  if (clinicSlugMismatch(session.clinicSlug, host)) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  return null;
}
