/**
 * Runtime env reads for Edge middleware.
 * Next.js can inline `process.env.AUTH_SECRET` at build time; dynamic keys
 * keep Docker runtime `.env` and build-arg secrets in sync for session HMAC.
 */

const AUTH_SECRET_KEY = ["AUTH", "SECRET"].join("_");
const APP_ROOT_DOMAIN_KEY = ["APP", "ROOT", "DOMAIN"].join("_");
const DEFAULT_CLINIC_SLUG_KEY = ["DEFAULT", "CLINIC", "SLUG"].join("_");

export function readAuthSecretEnv(): string | undefined {
  return process.env[AUTH_SECRET_KEY]?.trim() || undefined;
}

export function readAppRootDomainEnv(): string | undefined {
  return process.env[APP_ROOT_DOMAIN_KEY]?.trim() || undefined;
}

export function readDefaultClinicSlugEnv(): string | undefined {
  return process.env[DEFAULT_CLINIC_SLUG_KEY]?.trim() || undefined;
}
