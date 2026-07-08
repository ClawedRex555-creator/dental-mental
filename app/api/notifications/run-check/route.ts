import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import {
  processNotificationQueue,
  runNotificationScheduleCheck,
} from "@/lib/notifications/worker.server";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  const scheduled = await runNotificationScheduleCheck(ctx.clinicId);
  const processed = await processNotificationQueue({ clinicId: ctx.clinicId, limit: 50 });

  return NextResponse.json({ ok: true, scheduled, processed });
}
