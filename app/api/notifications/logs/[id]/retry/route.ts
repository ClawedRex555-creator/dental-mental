import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import { dispatchNotificationById } from "@/lib/notifications/dispatch.server";
import { resetDeliveryForRetry } from "@/lib/notifications/db.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  const { id } = await context.params;
  await resetDeliveryForRetry(ctx.clinicId, id);
  const result = await dispatchNotificationById(ctx.clinicId, id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
