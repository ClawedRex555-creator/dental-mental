import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { sendDocumentSignPackage } from "@/lib/document-sign/send.server";
import type { DocumentSignRef } from "@/lib/document-sign/types";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import { getServerSession } from "@/lib/get-server-session";
import { isDatabaseEnabled } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth-session";

type StaffSession = SessionPayload & { clinicId: string; clinicSlug: string };

async function requireStaff(request: Request): Promise<NextResponse | StaffSession> {
  const session = await getServerSession();
  if (!session?.clinicId || !session.clinicSlug || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;
  return { ...session, clinicId: session.clinicId, clinicSlug: session.clinicSlug };
}

export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const sessionOrDenied = await requireStaff(request);
  if (sessionOrDenied instanceof NextResponse) return sessionOrDenied;
  const session = sessionOrDenied;

  let body: {
    patientId?: string;
    appointmentId?: string;
    documents?: DocumentSignRef[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.patientId?.trim() || !Array.isArray(body.documents) || body.documents.length === 0) {
    return NextResponse.json({ error: "Укажите patientId и documents" }, { status: 400 });
  }

  const snapshot = await getClinicDataDb(session.clinicId);
  const patient = snapshot?.data.patients.find((p) => p.id === body.patientId);
  if (!patient) {
    return NextResponse.json({ error: "Пациент не найден" }, { status: 404 });
  }

  const documents = body.documents
    .filter((d) => d?.id && d?.name)
    .map((d) => ({
      id: String(d.id),
      name: String(d.name),
      kind: d.kind ? String(d.kind) : undefined,
    }));

  const result = await sendDocumentSignPackage({
    clinicId: session.clinicId,
    clinicSlug: session.clinicSlug,
    patient,
    documentRefs: documents,
    appointmentId: body.appointmentId?.trim(),
    createdBy: session.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Не удалось отправить" }, { status: 400 });
  }

  await writeAuditLog(
    auditFromRequest(request, {
      clinicId: session.clinicId,
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      action: "create",
      resourceType: "patient",
      resourceId: body.patientId,
      metadata: {
        documentSignRequestId: result.requestId,
        provider: result.provider,
        externalId: result.externalId,
        documentCount: documents.length,
      },
    })
  );

  return NextResponse.json({
    ok: true,
    requestId: result.requestId,
    provider: result.provider,
    externalId: result.externalId,
    debugOtp: result.debugOtp,
    debugSignUrl: result.debugSignUrl,
  });
}
