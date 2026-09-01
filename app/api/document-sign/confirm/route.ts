import { NextResponse } from "next/server";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import { confirmDocumentSign } from "@/lib/document-sign/confirm.server";
import { verifyDocumentSignToken } from "@/lib/document-sign/token.server";
import { isDatabaseEnabled } from "@/lib/db";

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    undefined
  );
}

/** Подтверждение подписи пациентом: POST { token, code } */
export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }

  let body: { token?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const token = body.token?.trim();
  const code = body.code?.trim();
  if (!token || !code) {
    return NextResponse.json({ error: "Укажите token и code" }, { status: 400 });
  }

  const result = await confirmDocumentSign({
    token,
    code,
    signedIp: clientIp(request),
    signedUserAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const payload = verifyDocumentSignToken(token);
  if (payload) {
    await writeAuditLog(
      auditFromRequest(request, {
        clinicId: payload.clinicId,
        action: "update",
        resourceType: "patient",
        resourceId: payload.patientId,
        metadata: { documentSign: "signed", signedAt: result.signedAt },
      })
    );
  }

  return NextResponse.json({ ok: true, signedAt: result.signedAt });
}
