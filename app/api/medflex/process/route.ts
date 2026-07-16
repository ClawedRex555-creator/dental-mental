import { NextResponse } from "next/server";
import { timingSafeEqualString } from "@/lib/auth-session-token";
import { processMedflexQueue } from "@/lib/medflex/push.server";

function authorizeCron(request: Request): boolean {
  const secret = process.env.MEDFLEX_CRON_SECRET?.trim() || process.env.EGISZ_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) return false;
  return timingSafeEqualString(m[1].trim(), secret);
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "medflex-process" });
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let clinicId: string | undefined;
  let limit: number | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      clinicId?: string;
      limit?: number;
    };
    clinicId = body.clinicId;
    limit = body.limit;
  } catch {
    /* empty */
  }
  const result = await processMedflexQueue({ clinicId, limit });
  return NextResponse.json(result);
}
