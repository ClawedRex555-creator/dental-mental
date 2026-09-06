import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { cancelEmkaroSignPackage } from "@/lib/document-sign/cancel.server";
import { assertClinicModule } from "@/lib/module-access.server";
import { getServerSession } from "@/lib/get-server-session";
import { isDatabaseEnabled } from "@/lib/db";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";

export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await getServerSession();
  if (!session?.clinicId || !session.clinicSlug || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;
  const moduleDenied = await assertClinicModule(session.clinicId, "document_sign");
  if (moduleDenied) return moduleDenied;

  let body: { requestId?: string; packageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.requestId && !body.packageId) {
    return NextResponse.json({ error: "Укажите requestId или packageId" }, { status: 400 });
  }

  const result = await cancelEmkaroSignPackage({
    clinicId: session.clinicId,
    requestId: body.requestId,
    packageId: body.packageId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Не удалось отменить" }, { status: 400 });
  }

  await writeAuditLog(
    auditFromRequest(request, {
      clinicId: session.clinicId,
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      action: "update",
      resourceType: "patient",
      metadata: {
        event: "sign_package_cancelled",
        requestId: body.requestId,
        packageId: body.packageId,
      },
    })
  );

  return NextResponse.json({ ok: true });
}
