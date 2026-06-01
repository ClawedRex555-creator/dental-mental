import {
  parseClinicPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";

export interface ClinicDataFetchResult {
  data: ClinicPersistedState | null;
  updatedAt: string | null;
  database: boolean;
  /** Нет прав на полный snapshot (врач, ассистент, бухгалтер) */
  forbidden?: boolean;
}

export async function fetchClinicDataFromServer(): Promise<ClinicDataFetchResult | null> {
  const res = await fetch("/api/clinic/data", { credentials: "same-origin" });
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
  data: ClinicPersistedState
): Promise<{ ok: boolean; error?: string; updatedAt?: string; forbidden?: boolean }> {
  const res = await fetch("/api/clinic/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ data }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    updatedAt?: string;
  };
  if (res.status === 403) {
    return { ok: false, forbidden: true, error: json.error ?? "Доступ запрещён" };
  }
  if (!res.ok) {
    return { ok: false, error: json.error ?? "Не удалось сохранить данные" };
  }
  return { ok: true, updatedAt: json.updatedAt };
}
