import { NextResponse } from "next/server";
import { assertClinicHost } from "@/lib/assert-clinic-host";
import {
  getLatestTaskForPackage,
  listOpenTasksForClinic,
} from "@/lib/document-sign/clinic-sms/tasks.server";
import { CLINIC_SMS_TASK_STATUS_LABELS } from "@/lib/document-sign/clinic-sms/types";
import { getServerSession } from "@/lib/get-server-session";
import { isDatabaseEnabled } from "@/lib/db";

/** Desktop: статусы SMS-задач клиники (без полного smsText/publicSignUrl в списке). */
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

  const url = new URL(request.url);
  const packageId = url.searchParams.get("packageId")?.trim();

  if (packageId) {
    const task = await getLatestTaskForPackage(session.clinicId, packageId);
    if (!task) return NextResponse.json({ task: null });
    return NextResponse.json({
      task: {
        id: task.id,
        packageId: task.packageId,
        status: task.status,
        statusLabel: CLINIC_SMS_TASK_STATUS_LABELS[task.status],
        patientDisplayName: task.patientDisplayName,
        recipientPhoneMasked: task.recipientPhoneMasked,
        documentCount: task.documentTitles.length,
        createdAt: task.createdAt,
        expiresAt: task.expiresAt,
        manualSendConfirmedAt: task.manualSendConfirmedAt,
      },
    });
  }

  const tasks = await listOpenTasksForClinic(session.clinicId, 50);
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      packageId: t.packageId,
      status: t.status,
      statusLabel: CLINIC_SMS_TASK_STATUS_LABELS[t.status],
      patientDisplayName: t.patientDisplayName,
      recipientPhoneMasked: t.recipientPhoneMasked,
      documentCount: t.documentTitles.length,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
    })),
  });
}
