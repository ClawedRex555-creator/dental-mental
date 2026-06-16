import { getAppRootDomain, parseClinicSlugFromHost } from "@/lib/clinic-host";

export type TlsAskDeps = {
  findClinicBySlug: (slug: string) => Promise<{ id: string } | null>;
};

/** Core tls-ask decision logic (testable without Next.js route). */
export async function evaluateTlsAskDomain(
  domain: string,
  deps: TlsAskDeps
): Promise<200 | 400 | 403> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return 400;

  const root = getAppRootDomain();
  if (normalized === root || normalized === `www.${root}`) {
    return 200;
  }

  const slug = parseClinicSlugFromHost(normalized);
  if (!slug) return 403;

  try {
    const clinic = await deps.findClinicBySlug(slug);
    if (!clinic) return 403;
  } catch {
    return 403;
  }

  return 200;
}
