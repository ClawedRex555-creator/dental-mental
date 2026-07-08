import "server-only";

import {
  defaultNotificationClinicConfig,
  parseNotificationClinicConfig,
} from "@/lib/notifications/defaults";
import type { NotificationClinicConfig } from "@/lib/notifications/types";
import { withDb } from "@/lib/db";

export async function getNotificationConfig(
  clinicId: string
): Promise<NotificationClinicConfig> {
  const raw = await withDb(async (client) => {
    const res = await client.query<{ notifications_config: unknown }>(
      `SELECT notifications_config FROM clinics WHERE id = $1 LIMIT 1`,
      [clinicId]
    );
    return res.rows[0]?.notifications_config;
  });
  return parseNotificationClinicConfig(raw ?? defaultNotificationClinicConfig());
}

export async function saveNotificationConfig(
  clinicId: string,
  config: NotificationClinicConfig
): Promise<NotificationClinicConfig> {
  const parsed = parseNotificationClinicConfig(config);
  const updated = await withDb(async (client) => {
    const res = await client.query(
      `UPDATE clinics SET notifications_config = $2::jsonb WHERE id = $1`,
      [clinicId, JSON.stringify(parsed)]
    );
    return res.rowCount;
  });
  if (updated === null) throw new Error("База данных недоступна");
  if (updated === 0) throw new Error("Клиника не найдена");
  return parsed;
}
