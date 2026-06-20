import { randomUUID } from "node:crypto";

import { getTursoClient } from "@/lib/turso";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

let schemaReady: Promise<void> | null = null;

function ensureSchema() {
  schemaReady ??= getTursoClient()
    .execute(`create table if not exists native_sessions (
      session_id text primary key,
      user_id text not null,
      created_at text not null,
      expires_at text not null,
      revoked_at text
    )`)
    .then(() => undefined);

  return schemaReady;
}

export async function createNativeSession(userId: string): Promise<{
  sessionId: string;
  expiresAt: string;
}> {
  await ensureSchema();

  const sessionId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  await getTursoClient().execute({
    sql: `insert into native_sessions (session_id, user_id, created_at, expires_at)
          values (?, ?, ?, ?)`,
    args: [sessionId, userId, now.toISOString(), expiresAt.toISOString()],
  });

  return { sessionId, expiresAt: expiresAt.toISOString() };
}

export async function isNativeSessionValid(sessionId: string): Promise<boolean> {
  await ensureSchema();

  const result = await getTursoClient().execute({
    sql: `select expires_at, revoked_at from native_sessions where session_id = ? limit 1`,
    args: [sessionId],
  });

  const row = result.rows[0];
  if (!row) {
    return false;
  }

  if (row.revoked_at) {
    return false;
  }

  const expiresAt = typeof row.expires_at === "string" ? new Date(row.expires_at) : null;
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    return false;
  }

  return true;
}

export async function revokeNativeSession(sessionId: string): Promise<void> {
  await ensureSchema();

  await getTursoClient().execute({
    sql: `update native_sessions set revoked_at = ? where session_id = ?`,
    args: [new Date().toISOString(), sessionId],
  });
}
