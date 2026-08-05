import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import {
  countWebPushSubscriptionsForUser,
  deleteWebPushSubscription,
  upsertWebPushSubscription,
} from "@/lib/notifications/web-push.server";

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  const count = await countWebPushSubscriptionsForUser({
    clinicId: ctx.clinicId,
    userId: ctx.session.userId,
  });

  return NextResponse.json({ subscribed: count > 0, deviceCount: count });
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

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const ok = await upsertWebPushSubscription({
    clinicId: ctx.clinicId,
    userId: ctx.session.userId,
    subscription: {
      endpoint: body.endpoint ?? "",
      keys: {
        p256dh: body.keys?.p256dh ?? "",
        auth: body.keys?.auth ?? "",
      },
      userAgent: body.userAgent,
    },
  });

  if (!ok) {
    return NextResponse.json({ error: "Некорректные данные подписки" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  let endpoint: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
    endpoint = body.endpoint;
  } catch {
    endpoint = undefined;
  }

  const deleted = await deleteWebPushSubscription({
    clinicId: ctx.clinicId,
    userId: ctx.session.userId,
    endpoint,
  });

  return NextResponse.json({ ok: true, deleted });
}
