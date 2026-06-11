import webpush from "web-push";
import { getTursoClient } from "@/lib/turso";

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privKey = process.env.VAPID_PRIVATE_KEY;
  if (!pubKey || !privKey) throw new Error("VAPID keys are not configured.");
  webpush.setVapidDetails(subject, pubKey, privKey);
  vapidConfigured = true;
}

let schemaReady: Promise<void> | null = null;

function ensurePushSchema() {
  schemaReady ??= getTursoClient()
    .execute(
      `create table if not exists push_subscriptions (
        id text not null primary key,
        user_id text not null,
        endpoint text not null unique,
        p256dh text not null,
        auth text not null,
        created_at text not null
      )`
    )
    .then(() => undefined);
  return schemaReady;
}

export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await ensurePushSchema();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getTursoClient().execute({
    sql: `insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
          values (?, ?, ?, ?, ?, ?)
          on conflict(endpoint) do update set
            user_id = excluded.user_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth`,
    args: [id, userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, now]
  });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await ensurePushSchema();
  await getTursoClient().execute({
    sql: `delete from push_subscriptions where user_id = ? and endpoint = ?`,
    args: [userId, endpoint]
  });
}

export async function getSubscriptionsByUser(
  userId: string
): Promise<PushSubscriptionRecord[]> {
  await ensurePushSchema();
  const result = await getTursoClient().execute({
    sql: `select id, user_id, endpoint, p256dh, auth from push_subscriptions where user_id = ?`,
    args: [userId]
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth)
  }));
}

export async function getAllSubscriptions(): Promise<PushSubscriptionRecord[]> {
  await ensurePushSchema();
  const result = await getTursoClient().execute(
    `select id, user_id, endpoint, p256dh, auth from push_subscriptions`
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth)
  }));
}

export async function sendPushNotification(
  sub: PushSubscriptionRecord,
  payload: PushPayload
): Promise<{ ok: boolean; error?: string }> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404 or 410 = subscription expired, should be deleted
    return { ok: false, error: status === 404 || status === 410 ? "expired" : String(err) };
  }
}
