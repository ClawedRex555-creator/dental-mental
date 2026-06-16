import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import {
  isClientAuditAction,
  isValidAuditMetadata,
  isValidAuditResourceId,
  isValidAuditResourceType,
} from "@/lib/audit-validation";
import { getServerSession } from "@/lib/get-server-session";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await getServerSession();
  if (!session || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;

  let body: {
    action?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!isClientAuditAction(body.action) || !isValidAuditResourceType(body.resourceType)) {
    return NextResponse.json({ error: "Недопустимые action или resourceType" }, { status: 400 });
  }

  if (body.resourceId !== undefined && !isValidAuditResourceId(body.resourceId)) {
    return NextResponse.json({ error: "Недопустимый resourceId" }, { status: 400 });
  }

  if (body.metadata !== undefined && !isValidAuditMetadata(body.metadata)) {
    return NextResponse.json({ error: "Недопустимый metadata" }, { status: 400 });
  }

  const resourceId = isValidAuditResourceId(body.resourceId) ? body.resourceId : undefined;
  const metadata = isValidAuditMetadata(body.metadata) ? body.metadata : undefined;

  await writeAuditLog(
    auditFromRequest(request, {
      clinicId: session.clinicId,
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      action: body.action,
      resourceType: body.resourceType,
      resourceId,
      metadata,
    })
  );

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const hostDenied = assertClinicHost(session, request);
  if (hostDenied) return hostDenied;

  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const { listAuditLogs } = await import("@/lib/audit-log.server");
  const logs = await listAuditLogs(session.clinicId, 100);
  return NextResponse.json({ logs });
}
