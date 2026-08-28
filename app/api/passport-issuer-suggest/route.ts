import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { getServerSession } from "@/lib/get-server-session";
import {
  isDaDataPassportIssuerSuggestConfigured,
  suggestPassportIssuerViaDaData,
} from "@/lib/passport-issuer-suggest.server";

/**
 * Подсказка «кем выдан» по коду подразделения (DaData fms_unit).
 * Без DADATA_API_TOKEN: { suggestion: null, configured: false }.
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const configured = isDaDataPassportIssuerSuggestConfigured();

  if (!code) {
    return NextResponse.json({ suggestion: null, configured });
  }

  try {
    const suggestion = await suggestPassportIssuerViaDaData(code);
    return NextResponse.json({ suggestion, configured });
  } catch (err) {
    console.warn("[passport-issuer-suggest]", err);
    return NextResponse.json({ suggestion: null, configured });
  }
}
