import { fetchClinicDataMetaFromServer } from "@/lib/clinic-data-client";
import { requestForcePullClinicDataFromServer } from "@/lib/clinic-data-sync.client";
import type { Appointment } from "@/lib/types";

async function postAppointmentCommand(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; alreadyApplied?: boolean; error?: string }> {
  try {
    const meta = await fetchClinicDataMetaFromServer();
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        expectedUpdatedAt: meta?.updatedAt ?? null,
        expectedRevision: meta?.revision ?? null,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      alreadyApplied?: boolean;
      error?: string;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }
    await requestForcePullClinicDataFromServer({
      force: true,
      allowApplyDespitePending: true,
      allowDuringSaveCooldown: true,
    });
    return { ok: true, alreadyApplied: Boolean(json.alreadyApplied) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}

/** Создать запись через command API. */
export function createAppointmentViaCommandApi(appointment: Appointment) {
  return postAppointmentCommand("/api/clinic/appointments/create", { appointment });
}

/** Обновить запись через command API. */
export function updateAppointmentViaCommandApi(
  appointmentId: string,
  appointment: Appointment
) {
  return postAppointmentCommand("/api/clinic/appointments/update", {
    appointmentId,
    appointment,
  });
}

/** Отменить запись через command API. */
export function cancelAppointmentViaCommandApi(appointmentId: string) {
  return postAppointmentCommand("/api/clinic/appointments/cancel", { appointmentId });
}
