import { NextResponse } from "next/server";
import { findClinicBySlug } from "@/lib/clinic-db.server";
import { evaluateTlsAskDomain } from "@/lib/tls-ask.server";
import { verifyTlsAskSecret } from "@/lib/tls-ask-auth";

/**
 * Caddy on_demand_tls ask endpoint.
 * Returns 200 only for the platform host or a known clinic subdomain.
 */
export async function GET(request: Request) {
  if (!verifyTlsAskSecret(request)) {
    return new NextResponse(null, { status: 403 });
  }

  const domain = new URL(request.url).searchParams.get("domain") ?? "";
  const status = await evaluateTlsAskDomain(domain, { findClinicBySlug });
  return new NextResponse(null, { status });
}
