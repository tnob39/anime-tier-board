import { getTursoClient } from "@/lib/turso";

export type NativePushTokenRecord = {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: string;
};

export type NativePushPayload = {
  title: string;
  body: string;
  url?: string;
};

let schemaReady: Promise<void> | null = null;

function ensureNativePushSchema() {
  schemaReady ??= getTursoClient()
    .execute(
      `create table if not exists native_push_tokens (
        id text not null primary key,
        user_id text not null,
        expo_push_token text not null unique,
        platform text not null,
        created_at text not null
      )`
    )
    .then(() => undefined);
  return schemaReady;
}

export async function saveNativePushToken(
  userId: string,
  expoPushToken: string,
  platform: string
): Promise<void> {
  await ensureNativePushSchema();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getTursoClient().execute({
    sql: `insert into native_push_tokens (id, user_id, expo_push_token, platform, created_at)
          values (?, ?, ?, ?, ?)
          on conflict(expo_push_token) do update set
            user_id = excluded.user_id,
            platform = excluded.platform`,
    args: [id, userId, expoPushToken, platform, now]
  });
}

export async function removeNativePushToken(
  userId: string,
  expoPushToken: string
): Promise<void> {
  await ensureNativePushSchema();
  await getTursoClient().execute({
    sql: `delete from native_push_tokens where user_id = ? and expo_push_token = ?`,
    args: [userId, expoPushToken]
  });
}

export async function getNativePushTokensByUser(
  userId: string
): Promise<NativePushTokenRecord[]> {
  await ensureNativePushSchema();
  const result = await getTursoClient().execute({
    sql: `select id, user_id, expo_push_token, platform from native_push_tokens where user_id = ?`,
    args: [userId]
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    expoPushToken: String(row.expo_push_token),
    platform: String(row.platform)
  }));
}

export async function getAllNativePushTokens(): Promise<NativePushTokenRecord[]> {
  await ensureNativePushSchema();
  const result = await getTursoClient().execute(
    `select id, user_id, expo_push_token, platform from native_push_tokens`
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    expoPushToken: String(row.expo_push_token),
    platform: String(row.platform)
  }));
}

type ExpoPushTicket = {
  status: "ok" | "error";
  details?: { error?: string };
};

export async function sendExpoPushNotifications(
  tokens: string[],
  payload: NativePushPayload
): Promise<{ sent: number; expired: number; expiredTokens: string[] }> {
  if (tokens.length === 0) {
    return { sent: 0, expired: 0, expiredTokens: [] };
  }

  const messages = tokens.map((token) => ({
    to: token,
    sound: "default" as const,
    title: payload.title,
    body: payload.body,
    data: { url: payload.url ?? "/watchlist" }
  }));

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(messages)
  });

  if (!response.ok) {
    return { sent: 0, expired: 0, expiredTokens: [] };
  }

  const body = (await response.json()) as { data?: ExpoPushTicket[] };
  const tickets = body.data ?? [];

  let sent = 0;
  let expired = 0;
  const expiredTokens: string[] = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === "ok") {
      sent++;
      return;
    }

    if (ticket.details?.error === "DeviceNotRegistered") {
      expired++;
      const token = tokens[index];
      if (token) {
        expiredTokens.push(token);
      }
    }
  });

  return { sent, expired, expiredTokens };
}