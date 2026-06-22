import {
  parseClinicPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export interface ClinicDataFetchResult {
  data: ClinicPersistedState | null;
  updatedAt: string | null;
  database: boolean;
  /** Нет прав на полный snapshot (врач, ассистент, бухгалтер) */
  forbidden?: boolean;
}

export interface ClinicDataMetaResult {
  updatedAt: string | null;
  database: boolean;
  forbidden?: boolean;
}

export async function fetchClinicDataMetaFromServer(): Promise<ClinicDataMetaResult | null> {
  const res = await fetchWithTimeout("/api/clinic/data?meta=1", {
    credentials: "same-origin",
  });
  if (res.status === 503) return null;
  if (res.status === 403) {
    return { updatedAt: null, database: true, forbidden: true };
  }
  if (!res.ok) return null;

  const json = (await res.json()) as {
    updatedAt?: string | null;
    database?: boolean;
  };

  if (!json.database) return { updatedAt: null, database: false };
  return {
    updatedAt: json.updatedAt ?? null,
    database: true,
  };
}

export async function fetchClinicDataFromServer(): Promise<ClinicDataFetchResult | null> {
  const res = await fetchWithTimeout("/api/clinic/data", { credentials: "same-origin" });
  if (res.status === 503) return null;
  if (res.status === 403) {
    return { data: null, updatedAt: null, database: true, forbidden: true };
  }
  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: unknown;
    updatedAt?: string;
    database?: boolean;
  };

  if (!json.database) return { data: null, updatedAt: null, database: false };

  if (!json.data) {
    return { data: null, updatedAt: json.updatedAt ?? null, database: true };
  }

  const parsed = parseClinicPersistedState(json.data);
  return {
    data: parsed,
    updatedAt: json.updatedAt ?? null,
    database: true,
  };
}

export async function saveClinicDataToServer(
  data: ClinicPersistedState,
  options?: { keepalive?: boolean; expectedUpdatedAt?: string | null }
): Promise<{ ok: boolean; error?: string; updatedAt?: string; forbidden?: boolean; merged?: boolean }> {
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
    }),
    },
    options?.keepalive ? 120_000 : 60_000
  );
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    updatedAt?: string;
    merged?: boolean;
  };
  if (res.status === 403) {
    return { ok: false, forbidden: true, error: json.error ?? "Доступ запрещён" };
  }
  if (!res.ok) {
    return { ok: false, error: json.error ?? "Не удалось сохранить данные" };
  }
  return { ok: true, updatedAt: json.updatedAt, merged: json.merged === true };
}
