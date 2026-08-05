import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { isDatabaseEnabled } from "@/lib/db";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import { sendWebPushToUsers } from "@/lib/notifications/web-push.server";

/** Проверочный push на текущее устройство пользователя */
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

  const result = await sendWebPushToUsers({
    clinicId: ctx.clinicId,
    userIds: [ctx.session.userId],
    title: "Emkaro",
    body: "Тестовое push-уведомление. Если вы видите это — всё работает.",
    url: "/notifications",
  });

  if (result.sent === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          result.failed > 0
            ? "Не удалось доставить push (подписка устарела или браузер отклонил)"
            : "На этом аккаунте нет активных push-подписок. Сначала нажмите «Включить push».",
        ...result,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
