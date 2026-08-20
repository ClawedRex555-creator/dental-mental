import type { Service } from "@/lib/types";

export type ServiceCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

async function postServiceCommand(
  path: string,
  body: Record<string, unknown>
): Promise<ServiceCommandResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      alreadyApplied?: boolean;
      error?: string;
      updatedAt?: string | null;
      revision?: number | null;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      alreadyApplied: Boolean(json.alreadyApplied),
      updatedAt: json.updatedAt ?? null,
      revision:
        typeof json.revision === "number" && Number.isFinite(json.revision)
          ? json.revision
          : null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}

/** Сохранить услугу через command API (без полного snapshot PUT). */
export async function upsertServiceViaCommandApi(
  service: Service
): Promise<ServiceCommandResult> {
  return postServiceCommand("/api/clinic/services/upsert", { service });
}

/** Удалить услугу через command API. */
export async function deleteServiceViaCommandApi(
  serviceId: string
): Promise<ServiceCommandResult> {
  return postServiceCommand("/api/clinic/services/delete", { serviceId });
}
