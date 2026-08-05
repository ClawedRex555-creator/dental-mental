import { NextResponse } from "next/server";
import { findClinicBySlug } from "@/lib/clinic-db.server";
import { getAppRootDomain, parseClinicSlugFromHost } from "@/lib/clinic-host";
import { isDatabaseEnabled } from "@/lib/db";

/** Публичный контекст клиники по Host (поддомен) */
export async function GET(request: Request) {
  const host = request.headers.get("host");
  const slug = parseClinicSlugFromHost(host);

  if (!slug) {
    // Публично не отдаём directory всех клиник (tenant enumeration).
    return NextResponse.json({
      mode: "platform" as const,
      rootDomain: getAppRootDomain(),
      clinics: [],
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
