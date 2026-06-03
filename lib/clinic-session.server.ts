import "server-only";

import type { SessionPayload } from "@/lib/auth-session";
import { findClinicBySlug } from "@/lib/clinic-db.server";
import { parseClinicSlugFromHost } from "@/lib/clinic-host";

/** clinicId из сессии или по поддомену (если в cookie старая сессия без id) */
export async function resolveClinicIdForSession(
  session: SessionPayload | null,
  hostHeader: string | null
): Promise<string | null> {
  if (session?.clinicId) return session.clinicId;
  const slug = session?.clinicSlug ?? parseClinicSlugFromHost(hostHeader);
  if (!slug) return null;
  const clinic = await findClinicBySlug(slug);
  return clinic?.id ?? null;
}
