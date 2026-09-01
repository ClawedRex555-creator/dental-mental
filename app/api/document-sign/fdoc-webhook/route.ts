import { NextResponse } from "next/server";
import { isDatabaseEnabled } from "@/lib/db";
import {
  handleFdocWebhookPayload,
  verifyFdocWebhookAuth,
} from "@/lib/document-sign/fdoc/webhook.server";
import type { FdocWebhookPayload } from "@/lib/document-sign/fdoc/types";

/** Webhook статуса F.Doc → обновление document_sign_requests */
export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }

  if (!verifyFdocWebhookAuth(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: FdocWebhookPayload;
  try {
    payload = (await request.json()) as FdocWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await handleFdocWebhookPayload(payload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Webhook failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, handled: result.handled });
}
