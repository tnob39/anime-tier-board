import { createHmac } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Client, Transaction } from "@libsql/client";

import { getTursoClient } from "../turso.ts";

export const WRITE_RATE_LIMIT_TABLE = "atb_write_rate_limit_buckets_v2";
export const WRITE_RATE_LIMIT_DEFAULT_MAX_BUCKETS = 8000;
export const WRITE_RATE_LIMIT_BUSY_DEADLINE_MS = 2_000;
const CLEANUP_BATCH_SIZE = 100;
const RATE_LIMIT_KEY_DOMAIN = "anime-tier-board/write-rate-limit/v1";
const RATE_LIMIT_NAMESPACE_DOMAIN = "anime-tier-board/write-rate-limit-namespace/v1";
export const WRITE_RATE_LIMIT_SECRET_MIN_LENGTH = 32;

export type WriteRateLimitStoreKey = {
  kind: "user" | "ip";
  value: string;
};

export type WriteRateLimitConsumeInput = {
  policy: string;
  limit: number;
  windowMs: number;
  nowMs: number;
  keys: readonly WriteRateLimitStoreKey[];
};

export type WriteRateLimitConsumeResult =
  | { kind: "allowed" }
  | { kind: "limited"; retryAfterSec: number };

export type WriteRateLimitStore = {
  consume(input: WriteRateLimitConsumeInput): Promise<WriteRateLimitConsumeResult>;
};

export type WriteRateLimitStoreOptions = {
  maxBuckets?: number;
  secret: string;
  busyRetry?: {
    deadlineMs?: number;
    now?: () => number;
    sleep?: (delayMs: number) => Promise<void>;
  };
};

export function getWriteRateLimitNamespace(secret: string): string {
  return createHmac("sha256", validateWriteRateLimitSecret(secret))
    .update(RATE_LIMIT_NAMESPACE_DOMAIN, "utf8")
    .digest("hex");
}

export function digestWriteRateLimitKey(
  secret: string,
  policy: string,
  key: WriteRateLimitStoreKey
): string {
  return createHmac("sha256", validateWriteRateLimitSecret(secret))
    .update(RATE_LIMIT_KEY_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(policy, "utf8")
    .update("\0", "utf8")
    .update(key.kind, "utf8")
    .update("\0", "utf8")
    .update(key.value, "utf8")
    .digest("hex");
}

export function validateWriteRateLimitSecret(secret: unknown): string {
  if (
    typeof secret !== "string" ||
    secret !== secret.trim() ||
    secret.trim().length < WRITE_RATE_LIMIT_SECRET_MIN_LENGTH ||
    /[\s\p{Cc}]/u.test(secret)
  ) {
    throw new Error("Invalid write rate-limit secret");
  }
  return secret;
}

function numericColumn(value: unknown, column: string): number {
  const number = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid rate-limit ${column}`);
  }
  return number;
}

function retryAfterSeconds(resetAt: number, nowMs: number): number {
  return Math.max(1, Math.ceil((resetAt - nowMs) / 1000));
}

function isRetryableSqliteLockError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "SQLITE_BUSY" ||
    candidate.code === "SQLITE_LOCKED" ||
    candidate.code === "SQLITE_LOCKED_SHAREDCACHE" ||
    (typeof candidate.message === "string" &&
      /SQLITE_(?:BUSY|LOCKED(?:_SHAREDCACHE)?)/.test(candidate.message))
  );
}

function busyDeadlineExceeded(): Error {
  return new Error("SQLite busy retry deadline exceeded");
}

async function waitForBusyRetry(
  attempt: number,
  now: () => number,
  sleep: (delayMs: number) => Promise<void>,
  deadline: number,
  cause: unknown
): Promise<void> {
  const remainingMs = deadline - now();
  if (remainingMs <= 0) throw busyDeadlineExceeded();

  const backoffMs = Math.min(50, 5 * 2 ** attempt);
  await sleep(Math.min(remainingMs, backoffMs));

  if (now() >= deadline) {
    const error = busyDeadlineExceeded();
    if (cause instanceof Error) error.cause = cause;
    throw error;
  }
}

function uniqueDigestKeys(
  secret: string,
  input: WriteRateLimitConsumeInput
): string[] {
  return [
    ...new Set(
      input.keys.map((key) => digestWriteRateLimitKey(secret, input.policy, key))
    ),
  ];
}

async function finishTransaction(
  transaction: Transaction,
  committed: boolean
): Promise<void> {
  if (committed) {
    transaction.close();
    return;
  }
  try {
    await transaction.rollback();
  } finally {
    transaction.close();
  }
}

export class LibSqlWriteRateLimitStore implements WriteRateLimitStore {
  private readonly maxBuckets: number;
  private readonly secret: string;
  private readonly namespace: string;
  private readonly busyDeadlineMs: number;
  private readonly busyNow: () => number;
  private readonly busySleep: (delayMs: number) => Promise<void>;
  private schemaReady: Promise<void> | null = null;
  private readonly clientFactory: () => Client;

  constructor(
    clientFactory: () => Client,
    options: WriteRateLimitStoreOptions
  ) {
    this.clientFactory = clientFactory;
    this.maxBuckets = options.maxBuckets ?? WRITE_RATE_LIMIT_DEFAULT_MAX_BUCKETS;
    this.secret = validateWriteRateLimitSecret(options.secret);
    this.namespace = getWriteRateLimitNamespace(this.secret);
    this.busyDeadlineMs = options.busyRetry?.deadlineMs ?? WRITE_RATE_LIMIT_BUSY_DEADLINE_MS;
    this.busyNow = options.busyRetry?.now ?? (() => performance.now());
    this.busySleep = options.busyRetry?.sleep ?? ((delayMs) => new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    }));
    if (!Number.isSafeInteger(this.busyDeadlineMs) || this.busyDeadlineMs < 1) {
      throw new Error("Invalid SQLite busy retry deadline");
    }
    if (!Number.isSafeInteger(this.maxBuckets) || this.maxBuckets < 1) {
      throw new Error("Invalid rate-limit max bucket count");
    }
  }

  async consume(input: WriteRateLimitConsumeInput): Promise<WriteRateLimitConsumeResult> {
    const deadline = this.busyNow() + this.busyDeadlineMs;
    for (let attempt = 0; ; attempt += 1) {
      if (this.busyNow() >= deadline) throw busyDeadlineExceeded();
      try {
        return await this.consumeOnce(input, deadline);
      } catch (error) {
        if (!isRetryableSqliteLockError(error)) throw error;
        await waitForBusyRetry(
          attempt,
          this.busyNow,
          this.busySleep,
          deadline,
          error
        );
      }
    }
  }

  private async consumeOnce(
    input: WriteRateLimitConsumeInput,
    deadline: number
  ): Promise<WriteRateLimitConsumeResult> {
    const keys = uniqueDigestKeys(this.secret, input);
    if (keys.length === 0) {
      throw new Error("Rate-limit consumption requires a key");
    }

    await this.ensureSchemaUntil(deadline);
    if (this.busyNow() >= deadline) throw busyDeadlineExceeded();
    const client = this.clientFactory();
    let transaction: Transaction | null = null;
    let committed = false;

    try {
      transaction = await client.transaction("write");
      const placeholders = keys.map(() => "?").join(", ");
      await transaction.execute({
        sql: `DELETE FROM ${WRITE_RATE_LIMIT_TABLE}
              WHERE rowid IN (
                SELECT rowid FROM ${WRITE_RATE_LIMIT_TABLE}
                WHERE reset_at <= ?
                ORDER BY reset_at ASC
                LIMIT ?
              )`,
        args: [input.nowMs, CLEANUP_BATCH_SIZE],
      });
      const existing = await transaction.execute({
        sql: `SELECT bucket_key, count, reset_at
              FROM ${WRITE_RATE_LIMIT_TABLE}
              WHERE namespace = ? AND bucket_key IN (${placeholders})`,
        args: [this.namespace, ...keys],
      });

      let retryAfterSec = 1;
      let blocked = false;
      const rows = new Map<string, { count: number; resetAt: number }>();

      for (const row of existing.rows) {
        const bucketKey = String(row.bucket_key);
        const count = numericColumn(row.count, "count");
        const resetAt = numericColumn(row.reset_at, "reset_at");
        rows.set(bucketKey, { count, resetAt });
        if (resetAt > input.nowMs) {
          if (count >= input.limit) {
            blocked = true;
            retryAfterSec = Math.max(
              retryAfterSec,
              retryAfterSeconds(resetAt, input.nowMs)
            );
          }
        }
      }

      if (blocked) {
        await transaction.commit();
        committed = true;
        return { kind: "limited", retryAfterSec };
      }

      const newKeyCount = keys.reduce(
        (count, key) => count + (rows.has(key) ? 0 : 1),
        0
      );
      if (newKeyCount > 0) {
        const activeCountResult = await transaction.execute({
          sql: `SELECT COUNT(*) AS count
                FROM ${WRITE_RATE_LIMIT_TABLE}
                WHERE namespace = ? AND reset_at > ?`,
          args: [this.namespace, input.nowMs],
        });
        const activeCount = numericColumn(
          activeCountResult.rows[0]?.count,
          "active count"
        );
        if (activeCount + newKeyCount > this.maxBuckets) {
          await transaction.commit();
          committed = true;
          throw new Error("Rate-limit bucket capacity reached");
        }
      }

      const resetAt = input.nowMs + input.windowMs;
      for (const key of keys) {
        const row = rows.get(key);
        if (row && row.resetAt > input.nowMs) {
          await transaction.execute({
            sql: `UPDATE ${WRITE_RATE_LIMIT_TABLE}
                  SET count = count + 1, updated_at = ?
                  WHERE namespace = ? AND bucket_key = ?`,
            args: [input.nowMs, this.namespace, key],
          });
        } else {
          if (row) {
            await transaction.execute({
              sql: `UPDATE ${WRITE_RATE_LIMIT_TABLE}
                    SET count = 1, reset_at = ?, updated_at = ?
                    WHERE namespace = ? AND bucket_key = ? AND reset_at <= ?`,
              args: [resetAt, input.nowMs, this.namespace, key, input.nowMs],
            });
          } else {
            await transaction.execute({
              sql: `INSERT INTO ${WRITE_RATE_LIMIT_TABLE}
                    (namespace, bucket_key, count, reset_at, updated_at)
                    VALUES (?, ?, 1, ?, ?)`,
              args: [this.namespace, key, resetAt, input.nowMs],
            });
          }
        }
      }

      await transaction.commit();
      committed = true;
      return { kind: "allowed" };
    } finally {
      if (transaction) await finishTransaction(transaction, committed);
    }
  }

  async ensureSchema(): Promise<void> {
    const deadline = this.busyNow() + this.busyDeadlineMs;
    await this.ensureSchemaUntil(deadline);
  }

  private async ensureSchemaUntil(deadline: number): Promise<void> {
    this.schemaReady ??= (async () => {
      const client = this.clientFactory();
      if (client.protocol === "file") {
        await client.execute("PRAGMA busy_timeout = 250");
      }
      for (let attempt = 0; ; attempt += 1) {
        try {
          await client.batch(
            [
              {
                sql: `CREATE TABLE IF NOT EXISTS ${WRITE_RATE_LIMIT_TABLE} (
                  namespace TEXT NOT NULL,
                  bucket_key TEXT NOT NULL,
                  count INTEGER NOT NULL CHECK (count >= 0),
                  reset_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  PRIMARY KEY (namespace, bucket_key)
                )`,
                args: [],
              },
              {
                sql: `CREATE INDEX IF NOT EXISTS ${WRITE_RATE_LIMIT_TABLE}_namespace_reset_at_idx
                      ON ${WRITE_RATE_LIMIT_TABLE}(namespace, reset_at)`,
                args: [],
              },
            ],
            "write"
          );
          return;
        } catch (error) {
          if (!isRetryableSqliteLockError(error)) throw error;
          await waitForBusyRetry(
            attempt,
            this.busyNow,
            this.busySleep,
            deadline,
            error
          );
        }
      }
    })().catch((error) => {
      this.schemaReady = null;
      throw error;
    });
    await this.schemaReady;
    if (this.busyNow() >= deadline) throw busyDeadlineExceeded();
  }
}

export function createLibSqlWriteRateLimitStore(
  client: Client,
  options: WriteRateLimitStoreOptions
): LibSqlWriteRateLimitStore {
  return new LibSqlWriteRateLimitStore(() => client, options);
}

export function createTursoWriteRateLimitStore(
  options: WriteRateLimitStoreOptions
): LibSqlWriteRateLimitStore {
  return new LibSqlWriteRateLimitStore(() => getTursoClient(), options);
}

type InMemoryBucket = {
  count: number;
  resetAt: number;
};

export type InMemoryWriteRateLimitStore = WriteRateLimitStore & {
  reset(): void;
  size(): number;
  countForKey(key: string, nowMs: number): number;
  seed(key: string, count: number, resetAt: number): void;
  setMaxBuckets(maxBuckets: number | null): void;
};

export function createInMemoryWriteRateLimitStore(
  options: WriteRateLimitStoreOptions
): InMemoryWriteRateLimitStore {
  validateWriteRateLimitSecret(options.secret);
  const buckets = new Map<string, InMemoryBucket>();
  const defaultMaxBuckets = options.maxBuckets ?? WRITE_RATE_LIMIT_DEFAULT_MAX_BUCKETS;
  let maxBuckets: number | null = defaultMaxBuckets;

  return {
    async consume(input) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= input.nowMs) buckets.delete(key);
      }

      const keys = [
        ...new Set(
          input.keys.map((key) => `${input.policy}:${key.kind}:${key.value}`)
        ),
      ];
      let retryAfterSec = 1;
      for (const key of keys) {
        const bucket = buckets.get(key);
        if (bucket && bucket.resetAt > input.nowMs && bucket.count >= input.limit) {
          retryAfterSec = Math.max(
            retryAfterSec,
            retryAfterSeconds(bucket.resetAt, input.nowMs)
          );
        }
      }
      if (retryAfterSec > 1 || keys.some((key) => {
        const bucket = buckets.get(key);
        return bucket != null && bucket.resetAt > input.nowMs && bucket.count >= input.limit;
      })) {
        return { kind: "limited", retryAfterSec };
      }

      const newKeys = keys.filter((key) => !buckets.has(key));
      if (buckets.size + newKeys.length > (maxBuckets ?? defaultMaxBuckets)) {
        throw new Error("Rate-limit bucket capacity reached");
      }

      const resetAt = input.nowMs + input.windowMs;
      for (const key of keys) {
        const bucket = buckets.get(key);
        if (bucket && bucket.resetAt > input.nowMs) {
          bucket.count += 1;
        } else {
          buckets.set(key, { count: 1, resetAt });
        }
      }
      return { kind: "allowed" };
    },
    reset() {
      buckets.clear();
    },
    size() {
      return buckets.size;
    },
    countForKey(key, nowMs) {
      const bucket = buckets.get(key);
      return bucket && bucket.resetAt > nowMs ? bucket.count : 0;
    },
    seed(key, count, resetAt) {
      buckets.set(key, { count, resetAt });
    },
    setMaxBuckets(value) {
      maxBuckets = value;
    },
  };
}
