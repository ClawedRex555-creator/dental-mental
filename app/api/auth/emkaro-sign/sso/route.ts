import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/get-server-session";
import { getEmkaroSignTenantForClinic, readEmkaroSignEnv } from "@/lib/document-sign/emkaro-sign/config.server";
import { withDb } from "@/lib/db";

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** HS256 JWT совместимый с jose.jwtVerify на стороне Emkaro Sign */
function mintSignStaffAssertion(
  claims: Record<string, unknown>,
  secret: string,
  ttlSeconds = 120
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "HS256", typ: "JWT" });
  const body = base64urlJson({
    ...claims,
    typ: "emkaro-sign-staff",
    iss: "emkaro-mis",
    aud: "emkaro-sign",
    iat: now,
    exp: now + ttlSeconds,
  });
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function allowedSignOrigins(): string[] {
  const origins = new Set<string>();
  const primary = process.env.EMKARO_SIGN_API_URL?.trim().replace(/\/$/, "") ?? "";
  if (primary) {
    try {
      origins.add(new URL(primary).origin);
    } catch {
      /* ignore */
    }
  }
  // Production Sign host (если в .env забыли/опечатали EMKARO_SIGN_API_URL)
  origins.add("https://sign.emkaro.ru");
  const extra = process.env.EMKARO_SIGN_SSO_ALLOWED_ORIGINS?.trim() ?? "";
  for (const part of extra.split(",")) {
    const raw = part.trim().replace(/\/$/, "");
    if (!raw) continue;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      /* ignore */
    }
  }
  return [...origins];
}

function isAllowedSignCallback(redirectUri: string): boolean {
  try {
    const target = new URL(redirectUri);
    if (target.pathname !== "/api/auth/callback") return false;
    return allowedSignOrigins().includes(target.origin);
  } catch {
    return false;
  }
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Пользователь", lastName: "Emkaro" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "Emkaro" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/**
 * SSO bridge: Emkaro Sign → clinic subdomain → assertion → Sign /api/auth/callback
 *
 * GET /api/auth/emkaro-sign/sso?redirect_uri=https://sign…/api/auth/callback&state=…
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";

  if (!redirectUri || !state) {
    return NextResponse.json(
      { error: "redirect_uri и state обязательны" },
      { status: 400 }
    );
  }
  if (!isAllowedSignCallback(redirectUri)) {
    const configured = process.env.EMKARO_SIGN_API_URL?.trim() || "(не задан)";
    return NextResponse.json(
      {
        error:
          `redirect_uri не разрешён (${redirectUri}). ` +
          `EMKARO_SIGN_API_URL сейчас: ${configured}. ` +
          `Ожидается origin Sign, например https://sign.emkaro.ru/api/auth/callback`,
      },
      { status: 400 }
    );
  }

  const { webhookSecret } = readEmkaroSignEnv();
  if (!webhookSecret || webhookSecret.length < 16) {
    return NextResponse.json(
      { error: "EMKARO_SIGN_WEBHOOK_SECRET не задан на стороне МИС" },
      { status: 501 }
    );
  }

  const session = await getServerSession();
  if (!session?.clinicId || !session.email) {
    const returnPath = `/api/auth/emkaro-sign/sso?${url.searchParams.toString()}`;
    const login = new URL("/login", request.url);
    login.searchParams.set("from", returnPath);
    return NextResponse.redirect(login);
  }

  const tenant = await getEmkaroSignTenantForClinic(session.clinicId);
  if (!tenant) {
    return NextResponse.json(
      {
        error:
          "Клиника не привязана к Emkaro Sign (emkaro_sign_config / EMKARO_SIGN_TENANT_MAP)",
      },
      { status: 403 }
    );
  }

  let clinicName = session.clinicSlug ?? "Клиника";
  try {
    const row = await withDb(async (client) => {
      const res = await client.query<{ name: string }>(
        `SELECT name FROM clinics WHERE id = $1 LIMIT 1`,
        [session.clinicId]
      );
      return res.rows[0]?.name;
    });
    if (row) clinicName = row;
  } catch {
    /* ignore */
  }

  const { firstName, lastName } = splitName(session.name || session.email);
  const token = mintSignStaffAssertion(
    {
      sub: session.email.toLowerCase(),
      email: session.email.toLowerCase(),
      firstName,
      lastName,
      role: session.role,
      organizationId: tenant.organizationId,
      clinicId: tenant.clinicId,
      clinicName,
      clinicSlug: session.clinicSlug,
      emkaroUserId: session.userId,
    },
    webhookSecret
  );

  const target = new URL(redirectUri);
  target.searchParams.set("token", token);
  target.searchParams.set("state", state);
  return NextResponse.redirect(target);
}
