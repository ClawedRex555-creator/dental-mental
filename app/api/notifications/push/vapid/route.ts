import { NextResponse } from "next/server";
import { isDatabaseEnabled } from "@/lib/db";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import { getWebPushPublicKey } from "@/lib/notifications/web-push.server";

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
  }

  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  const publicKey = await getWebPushPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: "Web Push не настроен (нет VAPID ключей)" },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey });
}
