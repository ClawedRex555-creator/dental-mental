/** Парсинг поддомена клиники из Host */

const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "mail", "ftp"]);

export function getAppRootDomain(): string {
  return (process.env.APP_ROOT_DOMAIN ?? "localhost").trim().toLowerCase();
}

export function parseClinicSlugFromHost(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const hostname = hostHeader.split(":")[0].trim().toLowerCase();
  const root = getAppRootDomain();

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const fallback = process.env.DEFAULT_CLINIC_SLUG?.trim().toLowerCase();
    return fallback || null;
  }

  /** Пилот без домена: заход по IP сервера (http://123.45.67.89:3000) */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    const fallback = process.env.DEFAULT_CLINIC_SLUG?.trim().toLowerCase();
    return fallback || null;
  }

  if (hostname === root || hostname === `www.${root}`) {
    return null;
  }

  const suffix = `.${root}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes(".") || RESERVED_SUBDOMAINS.has(slug)) {
    return null;
  }

  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    return null;
  }

  return slug;
}

export function isPlatformHost(hostHeader: string | null): boolean {
  return parseClinicSlugFromHost(hostHeader) === null;
}

export function clinicLoginUrl(slug: string): string {
  const root = getAppRootDomain();
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  if (root === "localhost") {
    return `${protocol}://${slug}.localhost:3000/login`;
  }
  return `${protocol}://${slug}.${root}/login`;
}

export function clinicBaseUrl(slug: string): string {
  const root = getAppRootDomain();
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  if (root === "localhost") {
    return `${protocol}://${slug}.localhost:3000`;
  }
  return `${protocol}://${slug}.${root}`;
}
