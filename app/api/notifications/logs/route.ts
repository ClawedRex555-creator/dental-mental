import { NextResponse } from "next/server";
import {
  notificationsForbidden,
  requireNotificationsAdmin,
} from "@/lib/notifications/api-auth.server";
import { listNotificationLogs } from "@/lib/notifications/db.server";

export async function GET(request: Request) {
  const ctx = await requireNotificationsAdmin(request);
  if (!ctx) return notificationsForbidden();
  if (ctx.denied) return ctx.denied;

  const url = new URL(request.url);
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50) || 50);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

  const logs = await listNotificationLogs(ctx.clinicId, { limit, offset });
  return NextResponse.json({ logs });
}
