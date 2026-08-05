import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import { listNotificationProviderStatus } from "@/lib/notifications/providers/index.server";
import { getNotificationConfig, saveNotificationConfig } from "@/lib/notifications/settings.server";
import { parseNotificationClinicConfig } from "@/lib/notifications/defaults";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";

export async function GET(request: Request) {
  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  const [config, snapshot] = await Promise.all([
    getNotificationConfig(ctx.clinicId),
    getClinicDataDb(ctx.clinicId),
  ]);
  const clinicSettings = snapshot?.data.clinicSettings;

  return NextResponse.json({
    config,
    providers: listNotificationProviderStatus(),
    cronConfigured: Boolean(
      process.env.NOTIFICATIONS_CRON_SECRET?.trim()
    ),
    clinic: {
      name: clinicSettings?.name ?? "",
      phone: clinicSettings?.phone ?? "",
      address: clinicSettings?.address ?? "",
    },
  });
}

export async function PUT(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const parsed = parseNotificationClinicConfig(body);
  const saved = await saveNotificationConfig(ctx.clinicId, parsed);
  return NextResponse.json({ ok: true, config: saved });
}
