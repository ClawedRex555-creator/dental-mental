import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import type { AuditAction, AuditResourceType } from "@/lib/audit-log.server";
import { getServerSession } from "@/lib/get-server-session";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const session = await getServerSession();
  if (!session || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: {
    action?: AuditAction;
    resourceType?: AuditResourceType;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.action || !body.resourceType) {
    return NextResponse.json({ error: "Укажите action и resourceType" }, { status: 400 });
  }

  await writeAuditLog(
    auditFromRequest(request, {
      clinicId: session.clinicId,
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      action: body.action,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      metadata: body.metadata,
    })
  );

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.clinicId || session.isSuperAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const { listAuditLogs } = await import("@/lib/audit-log.server");
  const logs = await listAuditLogs(session.clinicId, 100);
  return NextResponse.json({ logs });
}
