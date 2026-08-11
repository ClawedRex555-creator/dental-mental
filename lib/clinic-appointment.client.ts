import {
  ackClinicServerVersion,
  notifyClinicDataChanged,
} from "@/lib/clinic-data-sync.client";
import type { Appointment } from "@/lib/types";

export type AppointmentCommandResult = {
  ok: boolean;
  alreadyApplied?: boolean;
  error?: string;
  updatedAt?: string | null;
  revision?: number | null;
};

async function postAppointmentCommand(
  path: string,
  body: Record<string, unknown>
): Promise<AppointmentCommandResult> {
  try {
    // CAS на сервере берётся из свежей строки + retry; client CAS не нужен
    // (устаревший CAS + autoMerge раньше молча откатывал статус).
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

    const updatedAt = json.updatedAt ?? null;
    const revision =
      typeof json.revision === "number" && Number.isFinite(json.revision)
        ? json.revision
        : null;
    // Только CAS — baseline после локального apply (иначе create «забывал» новую запись,
    // а pay/create затирали несохранённые правки пациента).
    ackClinicServerVersion(updatedAt, revision);
    notifyClinicDataChanged();

    return {
      ok: true,
      alreadyApplied: Boolean(json.alreadyApplied),
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
