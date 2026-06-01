import { readAppRootDomainEnv, readDefaultClinicSlugEnv } from "./auth-env.ts";

/** Парсинг поддомена клиники из Host */

const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "mail", "ftp"]);

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const s = slug.trim().toLowerCase();
  if (!SLUG_RE.test(s) || RESERVED_SUBDOMAINS.has(s)) return null;
  return s;
}

export function getAppRootDomain(): string {
  return (readAppRootDomainEnv() ?? "localhost").trim().toLowerCase();
}

/**
 * Извлекает slug клиники из Host, даже если APP_ROOT_DOMAIN в Edge-бандле устарел (localhost).
 * Пример: tstom.emkaro.ru → tstom
 */
export function parseClinicSlugFromHost(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const hostname = hostHeader.split(":")[0].trim().toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return normalizeSlug(readDefaultClinicSlugEnv());
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return normalizeSlug(readDefaultClinicSlugEnv());
  }

  const root = getAppRootDomain();

  if (root !== "localhost") {
    if (hostname === root || hostname === `www.${root}`) {
      return null;
    }

    const suffix = `.${root}`;
    if (hostname.endsWith(suffix)) {
      const slug = hostname.slice(0, -suffix.length);
      if (!slug.includes(".")) {
        return normalizeSlug(slug);
      }
    }
  }

  const labels = hostname.split(".");
  if (labels.length >= 3) {
    return normalizeSlug(labels[0]);
  }

  return null;
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

/** Сравнение slug клиники из cookie и Host (без ложных срабатываний при сбое env) */
export function clinicSlugMismatch(
  sessionSlug: string | undefined,
  hostHeader: string | null
): boolean {
  const hostSlug = parseClinicSlugFromHost(hostHeader);
  if (!sessionSlug || !hostSlug) return false;
  return sessionSlug.trim().toLowerCase() !== hostSlug;
}
