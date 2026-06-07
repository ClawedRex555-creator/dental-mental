import { NextResponse } from "next/server";
import { getEgiszSubmissionById, updateEgiszSubmission } from "@/lib/egisz/db.server";
import type { EgiszSubmissionStatus } from "@/lib/egisz/types";

function mapWebhookStatus(raw: unknown): EgiszSubmissionStatus | null {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("accept") || s.includes("success") || s === "ok") return "accepted";
  if (s.includes("reject") || s.includes("fail") || s === "error") return "rejected";
  if (s.includes("sent")) return "sent";
  return null;
}

/** Колбэки N3 (если настроены в ЛК) */
export async function POST(request: Request) {
  const webhookSecret = process.env.EGISZ_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "EGISZ_WEBHOOK_SECRET required" }, { status: 403 });
  }

  const token = request.headers.get("x-egisz-webhook-token");
  if (token !== webhookSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    submissionId?: string;
    externalId?: string;
    status?: string;
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const submissionId = body.submissionId?.trim();
  const externalId = body.externalId?.trim();
  if (!submissionId && !externalId) {
    return NextResponse.json({ error: "submissionId or externalId required" }, { status: 400 });
  }

  let submission = submissionId ? await getEgiszSubmissionById(submissionId) : null;
  if (!submission && externalId) {
    /* lookup by external_id could be added */
  }
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const status = mapWebhookStatus(body.status) ?? "sent";
  await updateEgiszSubmission(submission.id, {
    status,
    externalId: externalId ?? submission.externalId,
    errorMessage: status === "rejected" ? body.message : undefined,
    payload: {
      ...submission.payload,
      webhook: body,
    },
  });

  return NextResponse.json({ ok: true });
}
