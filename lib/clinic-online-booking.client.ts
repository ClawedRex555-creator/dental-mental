import type { AppointmentCommandResult } from "@/lib/clinic-appointment.client";
import { ackClinicServerVersion } from "@/lib/clinic-data-sync.client";
import type { OnlineBookingStatus } from "@/lib/types";

async function postOnlineBookingCommand(
  body: Record<string, unknown>
): Promise<AppointmentCommandResult & { appointmentId?: string }> {
  try {
    const res = await fetch("/api/clinic/online-bookings/update", {
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
      appointmentId?: string;
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
      updatedAt,
      revision,
      appointmentId: json.appointmentId,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Сеть недоступна",
    };
  }
}

export function updateOnlineBookingViaCommandApi(
  bookingId: string,
  status: OnlineBookingStatus
) {
  return postOnlineBookingCommand({ bookingId, status });
}
