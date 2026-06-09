import { NextResponse } from "next/server";
import { getAppRootDomain, parseClinicSlugFromHost } from "@/lib/clinic-host";
import { findClinicBySlug } from "@/lib/clinic-db.server";

/**
 * Caddy on_demand_tls ask endpoint.
 * Returns 200 only for the platform host or a known clinic subdomain.
 */
export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain")?.trim().toLowerCase();
  if (!domain) {
    return new NextResponse(null, { status: 400 });
  }

  const root = getAppRootDomain();
  if (domain === root || domain === `www.${root}`) {
    return new NextResponse(null, { status: 200 });
  }

  const slug = parseClinicSlugFromHost(domain);
  if (!slug) {
    return new NextResponse(null, { status: 403 });
  }

  try {
    const clinic = await findClinicBySlug(slug);
    if (!clinic) {
      return new NextResponse(null, { status: 403 });
    }
  } catch {
    // DB unavailable — allow valid slug shape so first visit can still obtain TLS.
    return new NextResponse(null, { status: 200 });
  }

  return new NextResponse(null, { status: 200 });
}
