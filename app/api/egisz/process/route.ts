import { NextResponse } from "next/server";
import { processEgiszQueue } from "@/lib/egisz/worker.server";

function authorizeCron(request: Request): boolean {
  const secret = process.env.EGISZ_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

/** POST: обработать очередь (cron / internal) */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { clinicId?: string; limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok */
  }

  const result = await processEgiszQueue({
    clinicId: body.clinicId,
    limit: body.limit ?? 10,
  });

  return NextResponse.json({ ok: true, ...result });
}

/** GET: health для cron-мониторинга */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, service: "egisz-process" });
}
