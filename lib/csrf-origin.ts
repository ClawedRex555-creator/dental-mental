/** Проверка Origin/Referer для state-changing запросов (базовая CSRF-защита) */
export function verifySameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!host) return false;

  if (origin) {
    try {
      const o = new URL(origin);
      return o.host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const r = new URL(referer);
      return r.host === host;
    } catch {
      return false;
    }
  }

  return process.env.NODE_ENV !== "production";
}
