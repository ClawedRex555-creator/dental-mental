import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import {
  isDaDataAddressSuggestConfigured,
  suggestAddressesViaDaData,
} from "@/lib/address-suggest.server";
import { getServerSession } from "@/lib/get-server-session";

/**
 * Подсказки адресов (DaData). Токен только на сервере.
 * Без DADATA_API_TOKEN отдаёт { suggestions: [], configured: false } —
 * клиент всё равно показывает адреса из базы клиники.
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({
      suggestions: [],
      configured: isDaDataAddressSuggestConfigured(),
    });
  }

  try {
    const suggestions = await suggestAddressesViaDaData(query, 8);
    return NextResponse.json({
      suggestions,
      configured: isDaDataAddressSuggestConfigured(),
    });
  } catch (err) {
    console.warn("[address-suggest]", err);
    return NextResponse.json({
      suggestions: [],
      configured: isDaDataAddressSuggestConfigured(),
    });
  }
}
