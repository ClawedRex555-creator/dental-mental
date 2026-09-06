import { NextResponse } from "next/server";
import { resolveDeviceByToken } from "@/lib/document-sign/clinic-sms/devices.server";
import {
  confirmManualSend,
  getTaskForClinic,
  listOpenTasksForClinic,
  markComposerOpened,
  markTaskPresented,
  toDeviceView,
} from "@/lib/document-sign/clinic-sms/tasks.server";
import { maskPhoneDisplay } from "@/lib/document-sign/clinic-sms/crypto";
import { buildSmsUri } from "@/lib/document-sign/clinic-sms/rules";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import { isDatabaseEnabled } from "@/lib/db";

function deviceTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("x-emkaro-device-token")?.trim();
  if (header) return header;
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

async function requireDevice(request: Request) {
  const token = deviceTokenFromRequest(request);
  if (!token) return null;
  return resolveDeviceByToken(token);
}

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }
  const device = await requireDevice(request);
  if (!device) {
    return NextResponse.json({ error: "Устройство не привязано" }, { status: 401 });
  }

  const tasks = await listOpenTasksForClinic(device.clinicId);
  for (const t of tasks) {
    await markTaskPresented(device.clinicId, t.id, device.deviceId);
  }
  const refreshed = await listOpenTasksForClinic(device.clinicId);
  return NextResponse.json({
    tasks: refreshed.map(toDeviceView),
  });
}

export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }
  const device = await requireDevice(request);
  if (!device) {
    return NextResponse.json({ error: "Устройство не привязано" }, { status: 401 });
  }

  let body: { taskId?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  if (!body.taskId || !body.action) {
    return NextResponse.json({ error: "Укажите taskId и action" }, { status: 400 });
  }

  const task = await getTaskForClinic(device.clinicId, body.taskId);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }

  if (body.action === "open_composer") {
    const updated = await markComposerOpened(device.clinicId, body.taskId);
    return NextResponse.json({
      ok: true,
      task: updated ? toDeviceView(updated) : toDeviceView(task),
      smsUri: buildSmsUri(task.recipientPhone, task.smsText),
      recipientPhone: task.recipientPhone,
      smsText: task.smsText,
    });
  }

  if (body.action === "confirm_sent") {
    const updated = await confirmManualSend({
      clinicId: device.clinicId,
      taskId: body.taskId,
      confirmedBy: device.deviceId,
    });
    if (!updated) {
      return NextResponse.json({ error: "Не удалось подтвердить" }, { status: 400 });
    }
    await writeAuditLog(
      auditFromRequest(request, {
        clinicId: device.clinicId,
        action: "update",
        resourceType: "patient",
        resourceId: task.patientId,
        metadata: {
          clinicSmsTaskId: task.id,
          packageId: task.packageId,
          deviceId: device.deviceId,
          event: "MANUAL_SEND_CONFIRMED",
          recipientMasked: maskPhoneDisplay(task.recipientPhone),
        },
      })
    );
    return NextResponse.json({
      ok: true,
      task: toDeviceView(updated),
      desktopStatus: "Сотрудник подтвердил отправку SMS",
    });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
