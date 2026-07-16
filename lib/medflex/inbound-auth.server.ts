import "server-only";

import { parseClinicSlugFromHost } from "@/lib/clinic-host";
import { findClinicBySlug } from "@/lib/clinic-db.server";
import { verifyMedflexInboundToken } from "@/lib/medflex/client.server";
import { getMedflexConfig } from "@/lib/medflex/db.server";

export async function resolveMedflexClinicFromRequest(request: Request): Promise<{
  clinicId: string;
  slug: string;
} | null> {
  const host = request.headers.get("host");
  const slug = parseClinicSlugFromHost(host);
  if (!slug) return null;
  const clinic = await findClinicBySlug(slug);
  if (!clinic) return null;
  return { clinicId: clinic.id, slug: clinic.slug };
}

export async function requireMedflexInboundAuth(
  request: Request
): Promise<{ clinicId: string; slug: string } | Response> {
  const clinic = await resolveMedflexClinicFromRequest(request);
  if (!clinic) {
    return Response.json({ detail: "Клиника не найдена" }, { status: 404 });
  }
  const config = await getMedflexConfig(clinic.clinicId);
  if (!config.enabled) {
    return Response.json({ detail: "MedFlex выключен" }, { status: 403 });
  }
  if (!verifyMedflexInboundToken(request.headers.get("authorization"), config.inboundToken)) {
    return Response.json(
      { detail: "Учетные данные не были предоставлены." },
      { status: 403 }
    );
  }
  return clinic;
}
