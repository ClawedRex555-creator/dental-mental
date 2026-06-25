/** Кэш контекста клиники — один запрос на загрузку (auth/me или /api/clinic/context) */

import type { ClinicModules } from "@/lib/modules";

export interface ClinicBootstrap {
  usesDb: boolean;
  slug: string | null;
  modules?: ClinicModules;
}

let cache: ClinicBootstrap | null = null;
let fetchPromise: Promise<ClinicBootstrap> | null = null;

export function setClinicBootstrapCache(data: ClinicBootstrap): void {
  cache = data;
}

export function getClinicBootstrapCache(): ClinicBootstrap | null {
  return cache;
}

async function fetchClinicContext(): Promise<ClinicBootstrap> {
  try {
    const res = await fetch("/api/clinic/context", { credentials: "include" });
    if (!res.ok) return { usesDb: false, slug: null };
    const data = (await res.json()) as {
      database?: boolean;
      mode?: string;
      slug?: string;
    };
    const slug = data.mode === "clinic" && data.slug ? data.slug : null;
    return {
      usesDb: data.mode === "clinic" && data.database === true,
      slug,
    };
  } catch {
    return { usesDb: false, slug: null };
  }
}

/** Контекст клиники: из кэша или один сетевой запрос на сессию */
export function resolveClinicBootstrap(): Promise<ClinicBootstrap> {
  if (cache) return Promise.resolve(cache);
  if (!fetchPromise) {
    fetchPromise = fetchClinicContext().then((data) => {
      cache = data;
      return data;
    });
  }
  return fetchPromise;
}

export function clearClinicBootstrapCache(): void {
  cache = null;
  fetchPromise = null;
}
