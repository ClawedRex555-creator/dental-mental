import { NextResponse } from "next/server";
import { findClinicBySlug, listClinics } from "@/lib/clinic-db.server";
import { clinicBaseUrl, getAppRootDomain, parseClinicSlugFromHost } from "@/lib/clinic-host";
import { isDatabaseEnabled } from "@/lib/db";

/** Публичный контекст клиники по Host (поддомен) */
export async function GET(request: Request) {
  const host = request.headers.get("host");
  const slug = parseClinicSlugFromHost(host);

  if (!slug) {
    const clinics = isDatabaseEnabled() ? await listClinics() : [];
    return NextResponse.json({
      mode: "platform" as const,
      rootDomain: getAppRootDomain(),
      clinics: clinics.map((c) => ({
        slug: c.slug,
        name: c.name,
        url: clinicBaseUrl(c.slug),
      })),
    });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({
      mode: "clinic" as const,
      slug,
      name: slug,
      database: false,
    });
  }

  const clinic = await findClinicBySlug(slug);
  if (!clinic) {
    return NextResponse.json({ error: "Клиника не найдена", slug }, { status: 404 });
  }

  return NextResponse.json({
    mode: "clinic" as const,
    slug: clinic.slug,
    name: clinic.name,
    database: true,
  });
}
