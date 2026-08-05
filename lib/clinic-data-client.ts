import {
  parseClinicPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import { parseClinicSaveServerResponse } from "@/lib/clinic-save-feedback";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export interface ClinicDataFetchResult {
  data: ClinicPersistedState | null;
  updatedAt: string | null;
  revision?: number | null;
  database: boolean;
  /** Нет прав на полный snapshot (врач, ассистент, бухгалтер) */
  forbidden?: boolean;
}

export interface ClinicDataMetaResult {
  updatedAt: string | null;
  revision?: number | null;
  database: boolean;
  forbidden?: boolean;
}

export async function fetchClinicDataMetaFromServer(): Promise<ClinicDataMetaResult | null> {
  const res = await fetchWithTimeout("/api/clinic/data?meta=1", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 503) return null;
  if (res.status === 403) {
    return { updatedAt: null, database: true, forbidden: true };
  }
  if (!res.ok) return null;

  const json = (await res.json()) as {
    updatedAt?: string | null;
    revision?: number | null;
    database?: boolean;
  };

  if (!json.database) return { updatedAt: null, database: false };
  return {
    updatedAt: json.updatedAt ?? null,
    revision: typeof json.revision === "number" ? json.revision : null,
    database: true,
  };
}

export async function fetchClinicDataFromServer(): Promise<ClinicDataFetchResult | null> {
  const res = await fetchWithTimeout("/api/clinic/data", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 503) return null;
  if (res.status === 403) {
    return { data: null, updatedAt: null, database: true, forbidden: true };
  }
  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: unknown;
    updatedAt?: string;
    revision?: number | null;
    database?: boolean;
  };

  if (!json.database) return { data: null, updatedAt: null, database: false };

  if (!json.data) {
    return {
      data: null,
      updatedAt: json.updatedAt ?? null,
      revision: typeof json.revision === "number" ? json.revision : null,
      database: true,
    };
  }

  const parsed = parseClinicPersistedState(json.data);
  return {
    data: parsed,
    updatedAt: json.updatedAt ?? null,
    revision: typeof json.revision === "number" ? json.revision : null,
    database: true,
  };
}

export async function saveClinicDataToServer(
  data: ClinicPersistedState,
  options?: {
    keepalive?: boolean;
    expectedUpdatedAt?: string | null;
    expectedRevision?: number | null;
  }
): Promise<{
  ok: boolean;
  error?: string;
  updatedAt?: string;
  revision?: number;
  forbidden?: boolean;
  merged?: boolean;
}> {
  const res = await fetchWithTimeout(
    "/api/clinic/data",
    {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: options?.keepalive ?? false,
    body: JSON.stringify({
      data,
      expectedUpdatedAt: options?.expectedUpdatedAt ?? undefined,
      expectedRevision:
        typeof options?.expectedRevision === "number"
          ? options.expectedRevision
          : undefined,
    }),
    },
    options?.keepalive ? 120_000 : 90_000
  );
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    updatedAt?: string;
    revision?: number;
    merged?: boolean;
  };
  const parsed = parseClinicSaveServerResponse(res, json);
  if (parsed.forbidden) {
    return { ok: false, forbidden: true, error: parsed.error ?? "Доступ запрещён" };
  }
  if (!parsed.ok) {
    return { ok: false, error: parsed.error ?? "Не удалось сохранить данные" };
  }
  return {
    ok: true,
    updatedAt: parsed.updatedAt,
    revision: typeof json.revision === "number" ? json.revision : undefined,
    merged: parsed.merged,
  };
}
