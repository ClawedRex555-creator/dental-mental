import "server-only";

import { listPendingDeliveries } from "@/lib/notifications/db.server";
import { dispatchNotificationDelivery } from "@/lib/notifications/dispatch.server";
import { syncAppointmentNotifications } from "@/lib/notifications/scheduler.server";
import { getNotificationConfig } from "@/lib/notifications/settings.server";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import { clinicHasModule } from "@/lib/module-access.server";
import { withDb } from "@/lib/db";
import type { Appointment } from "@/lib/types";

export async function processNotificationQueue(input?: {
  clinicId?: string;
  limit?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const limit = input?.limit ?? 30;
  const pending = await listPendingDeliveries(limit, input?.clinicId);
  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const result = await dispatchNotificationDelivery(row);
    if (result.ok) sent++;
    else failed++;
  }

  return { processed: pending.length, sent, failed };
}

/** Пересканировать все активные записи клиники и создать недостающие уведомления */
export async function runNotificationScheduleCheck(clinicId: string): Promise<{ scheduled: number }> {
  if (!(await clinicHasModule(clinicId, "notifications"))) {
    return { scheduled: 0 };
  }
  const config = await getNotificationConfig(clinicId);
  if (!config.settings.enabled) return { scheduled: 0 };

  const snapshot = await getClinicDataDb(clinicId);
  if (!snapshot) return { scheduled: 0 };

  const { scheduleNotificationsForAppointment } = await import(
    "@/lib/notifications/scheduler.server"
  );

  let scheduled = 0;
  for (const apt of snapshot.data.appointments) {
    scheduled += await scheduleNotificationsForAppointment({
      clinicId,
      appointment: apt,
      snapshot: snapshot.data,
    });
  }
  return { scheduled };
}

export async function maybeSyncAppointmentNotifications(
  clinicId: string,
  prevAppointments: Appointment[],
  nextAppointments: Appointment[]
): Promise<void> {
  if (!(await clinicHasModule(clinicId, "notifications"))) return;
  const snapshot = await getClinicDataDb(clinicId);
  if (!snapshot) return;
  await syncAppointmentNotifications({
    clinicId,
    prevAppointments,
    nextAppointments,
    snapshot: snapshot.data,
  });
}

export async function listClinicIdsWithNotificationsModule(): Promise<string[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM clinics WHERE COALESCE((modules->>'notifications')::boolean, false) = true`
      );
      return res.rows.map((r) => r.id);
    })) ?? []
  );
}
