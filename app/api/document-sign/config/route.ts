import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { getDocumentSignConfigView } from "@/lib/document-sign/send.server";
import { getServerSession } from "@/lib/get-server-session";

/** Настройки провайдера подписи для UI (без секретов) */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;

  return NextResponse.json(getDocumentSignConfigView());
}
