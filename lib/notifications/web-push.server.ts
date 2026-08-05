import "server-only";

import webpush from "web-push";
import { withDb } from "@/lib/db";

export interface WebPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface WebPushSubscriptionInput {
  endpoint: string;
  keys: WebPushSubscriptionKeys;
  userAgent?: string;
}

export interface StoredWebPushSubscription {
  id: string;
  clinicId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cachedVapid: VapidKeys | null = null;
let vapidConfigured = false;

function envVapid(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@emkaro.ru",
  };
}

async function loadOrCreateVapidKeys(): Promise<VapidKeys | null> {
  if (cachedVapid) return cachedVapid;
  const fromEnv = envVapid();
  if (fromEnv) {
    cachedVapid = fromEnv;
    return cachedVapid;
  }

  return withDb(async (client) => {
    const existing = await client.query<{
      public_key: string;
      private_key: string;
      subject: string;
    }>(`SELECT public_key, private_key, subject FROM web_push_vapid WHERE id = 1 LIMIT 1`);
    if (existing.rows[0]) {
      cachedVapid = {
        publicKey: existing.rows[0].public_key,
        privateKey: existing.rows[0].private_key,
        subject: existing.rows[0].subject,
      };
      return cachedVapid;
    }

    const generated = webpush.generateVAPIDKeys();
    const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@emkaro.ru";
    await client.query(
      `INSERT INTO web_push_vapid (id, public_key, private_key, subject)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [generated.publicKey, generated.privateKey, subject]
    );
    const again = await client.query<{
      public_key: string;
      private_key: string;
      subject: string;
    }>(`SELECT public_key, private_key, subject FROM web_push_vapid WHERE id = 1 LIMIT 1`);
    const row = again.rows[0];
    if (!row) return null;
    cachedVapid = {
      publicKey: row.public_key,
      privateKey: row.private_key,
      subject: row.subject,
    };
    return cachedVapid;
  });
}

async function ensureWebPushConfigured(): Promise<VapidKeys | null> {
  const keys = await loadOrCreateVapidKeys();
  if (!keys) return null;
  if (!vapidConfigured) {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    vapidConfigured = true;
  }
  return keys;
}

export async function getWebPushPublicKey(): Promise<string | null> {
  const keys = await ensureWebPushConfigured();
  return keys?.publicKey ?? null;
}

export async function upsertWebPushSubscription(input: {
  clinicId: string;
  userId: string;
  subscription: WebPushSubscriptionInput;
}): Promise<boolean> {
  const endpoint = input.subscription.endpoint?.trim();
  const p256dh = input.subscription.keys?.p256dh?.trim();
  const auth = input.subscription.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) return false;

  const ok = await withDb(async (client) => {
    await client.query(
      `INSERT INTO web_push_subscriptions
         (clinic_id, user_id, endpoint, p256dh, auth, user_agent, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         clinic_id = EXCLUDED.clinic_id,
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = NOW()`,
      [
        input.clinicId,
        input.userId,
        endpoint,
        p256dh,
        auth,
        input.subscription.userAgent?.slice(0, 500) ?? null,
      ]
    );
    return true;
  });
  return Boolean(ok);
}

export async function deleteWebPushSubscription(input: {
  clinicId: string;
  userId: string;
  endpoint?: string;
}): Promise<number> {
  const deleted = await withDb(async (client) => {
    if (input.endpoint?.trim()) {
      const res = await client.query(
        `DELETE FROM web_push_subscriptions
         WHERE clinic_id = $1 AND user_id = $2 AND endpoint = $3`,
        [input.clinicId, input.userId, input.endpoint.trim()]
      );
      return res.rowCount ?? 0;
    }
    const res = await client.query(
      `DELETE FROM web_push_subscriptions WHERE clinic_id = $1 AND user_id = $2`,
      [input.clinicId, input.userId]
    );
    return res.rowCount ?? 0;
  });
  return deleted ?? 0;
}

export async function listWebPushSubscriptionsForUsers(input: {
  clinicId: string;
  userIds: string[];
}): Promise<StoredWebPushSubscription[]> {
  const ids = [...new Set(input.userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return [];

  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        clinic_id: string;
        user_id: string;
        endpoint: string;
        p256dh: string;
        auth: string;
      }>(
        `SELECT id, clinic_id, user_id, endpoint, p256dh, auth
         FROM web_push_subscriptions
         WHERE clinic_id = $1 AND user_id = ANY($2::text[])`,
        [input.clinicId, ids]
      );
      return res.rows.map((row) => ({
        id: row.id,
        clinicId: row.clinic_id,
        userId: row.user_id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      }));
    })) ?? []
  );
}

export async function countWebPushSubscriptionsForUser(input: {
  clinicId: string;
  userId: string;
}): Promise<number> {
  const count = await withDb(async (client) => {
    const res = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM web_push_subscriptions
       WHERE clinic_id = $1 AND user_id = $2`,
      [input.clinicId, input.userId]
    );
    return Number(res.rows[0]?.count ?? 0);
  });
  return count ?? 0;
}

async function removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(`DELETE FROM web_push_subscriptions WHERE endpoint = $1`, [endpoint]);
  });
}

export async function sendWebPushToUsers(input: {
  clinicId: string;
  userIds: string[];
  title: string;
  body: string;
  url?: string;
}): Promise<{ sent: number; failed: number }> {
  const keys = await ensureWebPushConfigured();
  if (!keys) return { sent: 0, failed: 0 };

  const subs = await listWebPushSubscriptionsForUsers({
    clinicId: input.clinicId,
    userIds: input.userIds,
  });
  if (!subs.length) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url ?? "/",
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 60 * 60 * 12, urgency: "high" }
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscriptionByEndpoint(sub.endpoint);
        } else {
          console.warn("[web-push] send failed", {
            clinicId: input.clinicId,
            userId: sub.userId,
            statusCode,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    })
  );

  return { sent, failed };
}
