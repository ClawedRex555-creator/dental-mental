/**
 * SSRF guard for EGISZ gateway URLs (clinic-controlled config).
 * Blocks private/link-local/loopback hosts; HTTPS required in live mode.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** Returns normalized URL or throws Error with Russian message. */
export function assertSafeEgiszGatewayUrl(raw: string, options?: { requireHttps?: boolean }): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Не указан URL шлюза ЕГИСЗ");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Некорректный URL шлюза ЕГИСЗ");
  }

  const requireHttps = options?.requireHttps !== false;
  if (requireHttps && url.protocol !== "https:") {
    throw new Error("Шлюз ЕГИСЗ должен использовать HTTPS");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Недопустимый протокол шлюза ЕГИСЗ");
  }

  const host = url.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Запрещённый хост шлюза ЕГИСЗ");
  }
  if (host.includes(":") || host.startsWith("[")) {
    // IPv6 — block private ranges coarsely
    if (
      host === "::1" ||
      host.startsWith("[::1]") ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80")
    ) {
      throw new Error("Запрещённый хост шлюза ЕГИСЗ");
    }
  }
  if (isPrivateIpv4(host)) {
    throw new Error("Запрещён внутренний IP шлюза ЕГИСЗ");
  }

  return url.toString().replace(/\/$/, "");
}
