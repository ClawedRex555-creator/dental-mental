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

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const tpl = parseNotificationTemplate({ ...(body as object), id });
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
  if (!config.templates.some((t) => t.id === id)) {
    return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const updated = { ...tpl, id, updatedAt: now };
  const templates = config.templates.map((t) => (t.id === id ? updated : t));
  await saveNotificationConfig(ctx.clinicId, { ...config, templates });
  return NextResponse.json({ ok: true, template: updated });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  const { id } = await context.params;
  const config = await getNotificationConfig(ctx.clinicId);
  const target = config.templates.find((t) => t.id === id);
  if (!target) {
    return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
  }
  if (target.isDefault) {
    return NextResponse.json({ error: "Нельзя удалить шаблон по умолчанию" }, { status: 400 });
  }

  const templates = config.templates.filter((t) => t.id !== id);
  await saveNotificationConfig(ctx.clinicId, { ...config, templates });
  return NextResponse.json({ ok: true });
}
