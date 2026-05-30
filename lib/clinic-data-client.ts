import {
  parseClinicPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";

export interface ClinicDataFetchResult {
  data: ClinicPersistedState | null;
  updatedAt: string | null;
  database: boolean;
}

export async function fetchClinicDataFromServer(): Promise<ClinicDataFetchResult | null> {
  const res = await fetch("/api/clinic/data", { credentials: "same-origin" });
  if (res.status === 503) return null;
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
): Promise<{ ok: boolean; error?: string; updatedAt?: string }> {
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
  if (!res.ok) {
    return { ok: false, error: json.error ?? "Не удалось сохранить данные" };
  }
  return { ok: true, updatedAt: json.updatedAt };
}
