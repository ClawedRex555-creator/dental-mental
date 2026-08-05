import { NextResponse } from "next/server";
import { timingSafeEqualString } from "@/lib/auth-session-token";
import {
  listClinicIdsWithNotificationsModule,
  processNotificationQueue,
  runNotificationScheduleCheck,
} from "@/lib/notifications/worker.server";

function authorizeCron(request: Request): boolean {
  // Отдельный секрет обязателен — не расширяем blast radius AUTH_SECRET.
  const secret = process.env.NOTIFICATIONS_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqualString(header, expected);
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { clinicId?: string; limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    /* empty ok */
  }

  if (body.clinicId) {
    const scheduled = await runNotificationScheduleCheck(body.clinicId);
    const processed = await processNotificationQueue({
      clinicId: body.clinicId,
      limit: body.limit ?? 50,
    });
    return NextResponse.json({ ok: true, scheduled, processed });
  }

  const clinicIds = await listClinicIdsWithNotificationsModule();
  let totalScheduled = 0;
  let totalProcessed = 0;
  let totalSent = 0;
  let totalFailed = 0;

  for (const clinicId of clinicIds) {
    const scheduled = await runNotificationScheduleCheck(clinicId);
    totalScheduled += scheduled.scheduled;
    const processed = await processNotificationQueue({ clinicId, limit: body.limit ?? 30 });
    totalProcessed += processed.processed;
    totalSent += processed.sent;
    totalFailed += processed.failed;
  }

  return NextResponse.json({
    ok: true,
    clinics: clinicIds.length,
    scheduled: totalScheduled,
    processed: totalProcessed,
    sent: totalSent,
    failed: totalFailed,
  });
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, service: "notifications-process" });
}
