import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { listDocumentSignRequests } from "@/lib/document-sign/requests.server";
import { getServerSession } from "@/lib/get-server-session";
import { isDatabaseEnabled } from "@/lib/db";

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }

  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;

  const patientId = new URL(request.url).searchParams.get("patientId")?.trim();
  if (!patientId) {
    return NextResponse.json({ error: "Укажите patientId" }, { status: 400 });
  }

  const requests = await listDocumentSignRequests(session.clinicId, patientId);
  return NextResponse.json({ requests });
}
