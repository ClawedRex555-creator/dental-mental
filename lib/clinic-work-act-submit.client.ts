import { ackClinicServerVersion } from "@/lib/clinic-data-sync.client";
import type { WorkAct } from "@/lib/types";

export type SubmitWorkActCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  actId?: string;
  appointmentId?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

/**
 * Отправить акт администратору через command API.
 * notifyClinicDataChanged — после локального apply + markSynced у вызывающего.
 */
export async function submitWorkActViaCommandApi(input: {
  act: WorkAct;
  appointmentId: string;
}): Promise<SubmitWorkActCommandResult> {
  try {
    const res = await fetch("/api/clinic/work-acts/submit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        act: input.act,
        appointmentId: input.appointmentId,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      alreadyApplied?: boolean;
      error?: string;
      actId?: string;
      appointmentId?: string;
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
    ackClinicServerVersion(updatedAt, revision);

    return {
      ok: true,
      alreadyApplied: Boolean(json.alreadyApplied),
      actId: json.actId,
      appointmentId: json.appointmentId,
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
