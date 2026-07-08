import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import { getNotificationConfig, saveNotificationConfig } from "@/lib/notifications/settings.server";
import { parseNotificationTemplate } from "@/lib/notifications/defaults";
import { validateTemplateVariables } from "@/lib/notifications/template-service";
import type { NotificationTemplate } from "@/lib/notifications/types";

export async function GET(request: Request) {
  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  const config = await getNotificationConfig(ctx.clinicId);
  return NextResponse.json({ templates: config.templates });
}

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const tpl = parseNotificationTemplate(body);
  if (!tpl) {
    return NextResponse.json({ error: "Некорректный шаблон" }, { status: 400 });
  }

  const unknown = validateTemplateVariables(tpl.body);
  if (unknown.length) {
    return NextResponse.json(
      { error: `Неизвестные переменные: ${unknown.join(", ")}` },
      { status: 400 }
    );
  }

  const config = await getNotificationConfig(ctx.clinicId);
  const now = new Date().toISOString();
  const next: NotificationTemplate = {
    ...tpl,
    id: tpl.id || `tpl-${crypto.randomUUID()}`,
    createdAt: tpl.createdAt || now,
    updatedAt: now,
  };
  const templates = [...config.templates.filter((t) => t.id !== next.id), next];
  await saveNotificationConfig(ctx.clinicId, { ...config, templates });
  return NextResponse.json({ ok: true, template: next });
}
