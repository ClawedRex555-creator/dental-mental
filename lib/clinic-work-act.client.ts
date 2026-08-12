import { ackClinicServerVersion } from "@/lib/clinic-data-sync.client";
import type { WorkAct } from "@/lib/types";

export type WorkActCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  actId?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

async function postWorkActCommand(
  path: string,
  body: Record<string, unknown>
): Promise<WorkActCommandResult> {
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
      appointmentId?: string;
      actId?: string;
      updatedAt?: string | null;
      revision?: number | null;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }

    const updatedAt = json.updatedAt ?? null;
    const revision =
      typeof json.revision === "number" && Number.isFinite(json.revision)
        ? json.revision
        : null;
    // Только CAS — markSynced у вызывающего после локального apply.
    ackClinicServerVersion(updatedAt, revision);

    return {
      ok: true,
      alreadyApplied: Boolean(json.alreadyApplied),
      actId: json.actId ?? json.appointmentId,
      updatedAt,
      revision,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}

/**
 * Создать/обновить акт через command API.
 * markSynced — у вызывающего после локального apply.
 */
export function upsertWorkActViaCommandApi(input: {
  act: WorkAct;
  linkAppointmentId?: string | null;
  submittedToAdmin?: boolean;
}): Promise<WorkActCommandResult> {
  return postWorkActCommand("/api/clinic/work-acts/upsert", {
    act: input.act,
    ...(input.linkAppointmentId !== undefined
      ? { linkAppointmentId: input.linkAppointmentId }
      : {}),
    ...(typeof input.submittedToAdmin === "boolean"
      ? { submittedToAdmin: input.submittedToAdmin }
      : {}),
  });
}

/**
 * Удалить акт через command API.
 * markSynced — у вызывающего после локального apply.
 */
export function deleteWorkActViaCommandApi(actId: string): Promise<WorkActCommandResult> {
  return postWorkActCommand("/api/clinic/work-acts/delete", { actId });
}
