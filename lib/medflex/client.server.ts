import "server-only";

import { timingSafeEqualString } from "@/lib/auth-session-token";
import {
  MEDFLEX_DEFAULT_API_BASE,
  type MedflexClinicConfig,
} from "@/lib/medflex/types";

function authHeader(token: string): string {
  const trimmed = token.trim();
  if (/^token\s+/i.test(trimmed)) return trimmed;
  return `Token ${trimmed}`;
}

export function extractMedflexBearerToken(header: string | null): string | null {
  if (!header?.trim()) return null;
  const m = header.trim().match(/^Token\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

export function verifyMedflexInboundToken(
  header: string | null,
  expected?: string
): boolean {
  if (!expected?.trim()) return false;
  const got = extractMedflexBearerToken(header);
  if (!got) return false;
  return timingSafeEqualString(got, expected.trim());
}

export async function medflexPostJson(
  config: MedflexClinicConfig,
  path: string,
  body: unknown
): Promise<{ ok: boolean; status: number; text: string }> {
  const token = config.apiToken?.trim();
  if (!token) {
    return { ok: false, status: 0, text: "Не задан API-токен MedFlex" };
  }
  const base = (config.apiBaseUrl || MEDFLEX_DEFAULT_API_BASE).replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok || res.status === 204, status: res.status, text };
}
