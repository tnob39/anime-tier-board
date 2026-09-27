import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client";

import {
  WRITE_RATE_LIMITED,
  consumeWriteRateLimit,
  getWriteRateLimitStoreCreationCountForTests,
  resetWriteAdmissionForTests,
  setWriteRateLimitStoreForTests,
} from "../lib/api/write-admission.ts";
import {
  WRITE_RATE_LIMIT_TABLE,
  createLibSqlWriteRateLimitStore,
  digestWriteRateLimitKey,
  getWriteRateLimitNamespace,
  type WriteRateLimitStore,
  validateWriteRateLimitSecret,
} from "../lib/api/write-rate-limit-store.ts";
import { resetTursoClientForTests } from "../lib/turso.ts";

const LIMIT = 5;
const WINDOW_MS = 10_000;
const TEST_SECRET = "atb-write-rate-limit-test-key-32chars";
const STORE_OPTIONS = { secret: TEST_SECRET } as const;
const STORE_MODULE_URL = pathToFileURL(
  path.resolve("lib/api/write-rate-limit-store.ts")
).href;

const WORKER_SOURCE = `
  const { parentPort, workerData } = await import("node:worker_threads");
  const { createClient } = await import("@libsql/client");
  const { createLibSqlWriteRateLimitStore } = await import(${JSON.stringify(STORE_MODULE_URL)});
  const client = createClient({ url: workerData.databaseUrl });
  const startedAt = performance.now();
  let stage = "create-store";
  let result;
  try {
    const store = createLibSqlWriteRateLimitStore(client, {
      secret: workerData.secret,
    });
    if (workerData.preinitialize) {
      stage = "preinitialize";
      await store.ensureSchema();
      parentPort.postMessage({ kind: "ready" });
      await new Promise((resolve) => parentPort.once("message", resolve));
    }
    stage = "consume";
    result = await store.consume(workerData.input);
  } catch (error) {
    const details = [];
    let current = error;
    for (let depth = 0; depth < 3 && current; depth += 1) {
      details.push({
        name: current instanceof Error ? current.name : typeof current,
        code: current && typeof current === "object" && "code" in current ? String(current.code) : undefined,
        message: current instanceof Error ? current.message : String(current),
      });
      current = current instanceof Error ? current.cause : undefined;
    }
    result = { kind: "error", stage, message: error instanceof Error ? error.message : String(error), details };
  } finally {
    client.close();
  }
  parentPort.postMessage({ ...result, elapsedMs: Math.round(performance.now() - startedAt) });
  parentPort.close();
`;

type Harness = {
  directory: string;
  databaseUrl: string;
  clients: Client[];
};

function createHarness(clientCount = 1): Harness {
  const directory = mkdtempSync(path.join(os.tmpdir(), "atb-write-rate-limit-"));
  const databaseUrl = `file:${path.join(directory, "rate-limit.sqlite").replaceAll("\\", "/")}`;
  const clients = Array.from({ length: clientCount }, () => createClient({ url: databaseUrl }));
  return { directory, databaseUrl, clients };
}

function closeHarness(harness: Harness): void {
  for (const client of harness.clients) client.close();
  try {
    rmSync(harness.directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50,
    });
  } catch {
    // Windows may release libSQL's file handle after the test process exits.
  }
}

function requestInput(
  keys: Array<{ kind: "user" | "ip"; value: string }>,
  nowMs: number
) {
  return {
    policy: "store-test",
    limit: LIMIT,
    windowMs: WINDOW_MS,
    nowMs,
    keys,
  } as const;
}

function runIndependentWorker(
  databaseUrl: string,
  input: ReturnType<typeof requestInput>,
  options: { preinitialize?: boolean } = {}
) {
  return new Promise<WriteRateLimitStoreResult>((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      type: "module",
      execArgv: ["--experimental-strip-types"],
      workerData: { databaseUrl, input, secret: TEST_SECRET, ...options },
    });
    let message: WriteRateLimitStoreResult | undefined;
    let exited = false;
    let settled = false;
    const settle = () => {
      if (!settled && exited && message) {
        settled = true;
        resolve(message);
      }
    };
    worker.once("message", (received: WriteRateLimitStoreResult) => {
      message = received;
      settle();
    });
    worker.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    worker.once("exit", (code) => {
      exited = true;
      if (code !== 0 && !settled) {
        settled = true;
        reject(new Error(`worker exited with code ${code}`));
        return;
      }
      settle();
    });
  });
}

type WriteRateLimitStoreResult =
  | { kind: "allowed"; elapsedMs?: number }
  | { kind: "limited"; retryAfterSec: number; elapsedMs?: number }
  | { kind: "error"; stage?: string; message: string; details?: Array<{ name: string; code?: string; message: string }>; elapsedMs?: number };

async function runPreinitializedIndependentBurst(
  databaseUrl: string,
  inputs: readonly ReturnType<typeof requestInput>[]
): Promise<WriteRateLimitStoreResult[]> {
  const workers: Worker[] = [];
  try {
    for (const input of inputs) {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        type: "module",
        execArgv: ["--experimental-strip-types"],
        workerData: {
          databaseUrl,
          input,
          secret: TEST_SECRET,
          preinitialize: true,
        },
      });
      workers.push(worker);
      await new Promise<void>((resolve, reject) => {
        worker.once("message", (message: { kind: "ready" } | WriteRateLimitStoreResult) => {
          if (message.kind === "ready") resolve();
          else reject(new Error(workerResultDiagnostics([message])));
        });
        worker.once("error", reject);
      });
    }

    return await Promise.all(
      workers.map(
        (worker) =>
          new Promise<WriteRateLimitStoreResult>((resolve, reject) => {
            let message: WriteRateLimitStoreResult | undefined;
            let exited = false;
            let settled = false;
            const settle = () => {
              if (!settled && exited && message) {
                settled = true;
                resolve(message);
              }
            };
            worker.once("message", (received: WriteRateLimitStoreResult) => {
              message = received;
              settle();
            });
            worker.once("error", (error) => {
              if (!settled) {
                settled = true;
                reject(error);
              }
            });
            worker.once("exit", (code) => {
              exited = true;
              if (code !== 0 && !settled) {
                settled = true;
                reject(new Error(`worker exited with code ${code}`));
                return;
              }
              settle();
            });
            worker.postMessage({ consume: true });
          })
      )
    );
  } finally {
    for (const worker of workers) void worker.terminate();
  }
}

function workerResultDiagnostics(results: readonly WriteRateLimitStoreResult[]): string {
  return JSON.stringify(
    results.map((result, index) => {
      if (result.kind !== "error") return { index, kind: result.kind, elapsedMs: result.elapsedMs };
      return {
        index,
        kind: result.kind,
        stage: result.stage,
        elapsedMs: result.elapsedMs,
        message: result.message.replaceAll(TEST_SECRET, "[redacted-secret]"),
        details: result.details?.map((detail) => ({
          ...detail,
          message: detail.message.replaceAll(TEST_SECRET, "[redacted-secret]"),
        })),
      };
    })
  );
}

test("rate-limit bucket keys use domain-separated HMAC with explicit quality-checked keys", () => {
  const key = { kind: "user" as const, value: "same-user" };
  const first = digestWriteRateLimitKey(TEST_SECRET, "store-test", key);
  const second = digestWriteRateLimitKey(
    "atb-write-rate-limit-other-key-32chars",
    "store-test",
    key
  );
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
  assert.throws(() => validateWriteRateLimitSecret(""), /Invalid write rate-limit secret/);
  assert.throws(
    () => validateWriteRateLimitSecret("too-short"),
    /Invalid write rate-limit secret/
  );
  assert.throws(
    () => validateWriteRateLimitSecret(` ${TEST_SECRET}`),
    /Invalid write rate-limit secret/
  );
  assert.throws(
    () => validateWriteRateLimitSecret(`${TEST_SECRET}\u0085`),
    /Invalid write rate-limit secret/
  );
  assert.throws(
    () => validateWriteRateLimitSecret(`${TEST_SECRET.slice(0, 16)} ${TEST_SECRET.slice(16)}`),
    /Invalid write rate-limit secret/
  );
});

test("libSQL store enforces the exact limit and persists across clients", async () => {
  const harness = createHarness(2);
  try {
    const first = createLibSqlWriteRateLimitStore(harness.clients[0], STORE_OPTIONS);
    const second = createLibSqlWriteRateLimitStore(harness.clients[1], STORE_OPTIONS);
    const key = [{ kind: "user" as const, value: "exact-user" }];

    for (let i = 0; i < LIMIT; i += 1) {
      assert.deepEqual(await first.consume(requestInput(key, 1_000)), { kind: "allowed" });
    }
    const limited = await second.consume(requestInput(key, 1_000));
    assert.deepEqual(limited, { kind: "limited", retryAfterSec: 10 });

    const rows = await harness.clients[0].execute(
      `SELECT namespace, bucket_key, count FROM ${WRITE_RATE_LIMIT_TABLE}`
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].count, LIMIT);
    assert.equal(String(rows.rows[0].namespace), getWriteRateLimitNamespace(TEST_SECRET));
    assert.match(String(rows.rows[0].bucket_key), /^[0-9a-f]{64}$/);
    assert.doesNotMatch(String(rows.rows[0].bucket_key), /exact-user/);
  } finally {
    closeHarness(harness);
  }
});

test("old secret buckets cannot consume the current secret namespace capacity", async () => {
  const harness = createHarness(1);
  const oldSecret = "atb-write-rate-limit-old-secret-32chars";
  const newSecret = "atb-write-rate-limit-new-secret-32chars";
  try {
    const oldStore = createLibSqlWriteRateLimitStore(harness.clients[0], {
      maxBuckets: 2,
      secret: oldSecret,
    });
    const newStore = createLibSqlWriteRateLimitStore(harness.clients[0], {
      maxBuckets: 2,
      secret: newSecret,
    });
    assert.notEqual(getWriteRateLimitNamespace(oldSecret), getWriteRateLimitNamespace(newSecret));

    assert.deepEqual(
      await oldStore.consume(requestInput([{ kind: "user", value: "old-a" }], 60_000)),
      { kind: "allowed" }
    );
    assert.deepEqual(
      await oldStore.consume(requestInput([{ kind: "user", value: "old-b" }], 60_000)),
      { kind: "allowed" }
    );
    assert.deepEqual(
      await newStore.consume(requestInput([{ kind: "user", value: "new-a" }], 60_000)),
      { kind: "allowed" }
    );
    assert.deepEqual(
      await newStore.consume(requestInput([{ kind: "user", value: "new-b" }], 60_000)),
      { kind: "allowed" }
    );
    await assert.rejects(
      () => newStore.consume(requestInput([{ kind: "user", value: "new-c" }], 60_000)),
      /Rate-limit bucket capacity reached/
    );

    const counts = await harness.clients[0].execute({
      sql: `SELECT namespace, COUNT(*) AS count FROM ${WRITE_RATE_LIMIT_TABLE}
            GROUP BY namespace ORDER BY namespace`,
    });
    assert.deepEqual(
      counts.rows.map((row) => [String(row.namespace), Number(row.count)]),
      [
        [getWriteRateLimitNamespace(newSecret), 2],
        [getWriteRateLimitNamespace(oldSecret), 2],
      ].sort(([left], [right]) => left.localeCompare(right))
    );
  } finally {
    closeHarness(harness);
  }
});

test("same secret stores derive and use the same namespace", async () => {
  const harness = createHarness(2);
  try {
    const first = createLibSqlWriteRateLimitStore(harness.clients[0], STORE_OPTIONS);
    const second = createLibSqlWriteRateLimitStore(harness.clients[1], STORE_OPTIONS);
    assert.equal(getWriteRateLimitNamespace(TEST_SECRET), getWriteRateLimitNamespace(TEST_SECRET));
    const key = [{ kind: "user" as const, value: "shared-namespace-user" }];
    assert.deepEqual(await first.consume(requestInput(key, 70_000)), { kind: "allowed" });
    assert.deepEqual(await second.consume(requestInput(key, 70_000)), { kind: "allowed" });
    const rows = await harness.clients[0].execute({
      sql: `SELECT namespace, count FROM ${WRITE_RATE_LIMIT_TABLE}`,
    });
    assert.equal(rows.rows.length, 1);
    assert.equal(String(rows.rows[0].namespace), getWriteRateLimitNamespace(TEST_SECRET));
    assert.equal(Number(rows.rows[0].count), 2);
  } finally {
    closeHarness(harness);
  }
});

test("a blocked companion key does not consume the other bucket", async () => {
  const harness = createHarness(1);
  try {
    const store = createLibSqlWriteRateLimitStore(harness.clients[0], STORE_OPTIONS);
    const ip = [{ kind: "ip" as const, value: "198.51.100.40" }];
    const user = [{ kind: "user" as const, value: "companion-user" }];
    for (let i = 0; i < LIMIT; i += 1) {
      assert.deepEqual(await store.consume(requestInput(ip, 2_000)), { kind: "allowed" });
    }

    assert.deepEqual(
      await store.consume(requestInput([...user, ...ip], 2_000)),
      { kind: "limited", retryAfterSec: 10 }
    );
    const userDigest = digestWriteRateLimitKey(TEST_SECRET, "store-test", user[0]);
    const userRow = await harness.clients[0].execute({
      sql: `SELECT count FROM ${WRITE_RATE_LIMIT_TABLE}
            WHERE namespace = ? AND bucket_key = ?`,
      args: [getWriteRateLimitNamespace(TEST_SECRET), userDigest],
    });
    assert.equal(userRow.rows.length, 0);
    assert.deepEqual(await store.consume(requestInput(user, 2_000)), { kind: "allowed" });
  } finally {
    closeHarness(harness);
  }
});

test("preinitialized independent-worker bursts measure quota after schema setup", async () => {
  const harness = createHarness(1);
  let allowedTotal = 0;
  let limitedTotal = 0;
  let errorTotal = 0;
  try {
    await createLibSqlWriteRateLimitStore(harness.clients[0], STORE_OPTIONS).ensureSchema();
    for (let run = 0; run < 1; run += 1) {
      const key = `worker-burst-user-${run}`;
      const results = await runPreinitializedIndependentBurst(
        harness.databaseUrl,
        Array.from({ length: 2 }, () => requestInput([{ kind: "user", value: key }], 3_500))
      );
      for (let index = results.length; index < LIMIT + 1; index += 1) {
        results.push(
          await runIndependentWorker(
            harness.databaseUrl,
            requestInput([{ kind: "user", value: key }], 3_500)
          )
        );
      }
      const allowed = results.filter((result) => result.kind === "allowed").length;
      const limited = results.filter((result) => result.kind === "limited").length;
      const errors = results.filter((result) => result.kind === "error").length;
      allowedTotal += allowed;
      limitedTotal += limited;
      errorTotal += errors;
      assert.equal(allowed, LIMIT, workerResultDiagnostics(results));
      assert.equal(limited, 1, workerResultDiagnostics(results));
      assert.equal(errors, 0, workerResultDiagnostics(results));
    }

    const rows = await harness.clients[0].execute({
      sql: `SELECT COUNT(*) AS count FROM ${WRITE_RATE_LIMIT_TABLE} WHERE namespace = ?`,
      args: [getWriteRateLimitNamespace(TEST_SECRET)],
    });
    assert.equal(Number(rows.rows[0].count), 1);
    console.log(`preinitialized-burst runs=1 allowed=${allowedTotal} limited=${limitedTotal} errors=${errorTotal}`);
  } finally {
    closeHarness(harness);
  }
});

test("fresh two-worker initialization is bounded and leaves a usable schema", async () => {
  let allowedTotal = 0;
  let limitedTotal = 0;
  let errorTotal = 0;
  let permitted503s = 0;
  let maxErrorElapsedMs = 0;
  for (let run = 0; run < 30; run += 1) {
    const harness = createHarness(1);
    try {
      const input = requestInput([{ kind: "user", value: `worker-init-race-${run}` }], 3_750);
      const results = await Promise.all(
        Array.from({ length: 2 }, () => runIndependentWorker(harness.databaseUrl, input))
      );
      const allowed = results.filter((result) => result.kind === "allowed").length;
      const limited = results.filter((result) => result.kind === "limited").length;
      const errors = results.filter((result) => result.kind === "error");
      allowedTotal += allowed;
      limitedTotal += limited;
      errorTotal += errors.length;
      permitted503s += errors.length;
      maxErrorElapsedMs = Math.max(maxErrorElapsedMs, ...errors.map((error) => error.elapsedMs ?? 0));
      assert.ok(allowed >= 1 && allowed <= 2, workerResultDiagnostics(results));
      assert.equal(limited, 0, workerResultDiagnostics(results));
      assert.ok(errors.length <= 1, workerResultDiagnostics(results));
      for (const error of errors) {
        assert.match(error.message, /SQLite busy retry deadline exceeded/);
        assert.ok((error.elapsedMs ?? Number.POSITIVE_INFINITY) <= 2_500, workerResultDiagnostics(results));
      }

      const followUp = await runIndependentWorker(harness.databaseUrl, input);
      assert.equal(followUp.kind, "allowed", workerResultDiagnostics([followUp]));

      const schema = await harness.clients[0].execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        args: [WRITE_RATE_LIMIT_TABLE],
      });
      assert.equal(schema.rows.length, 1);
      const tableInfo = await harness.clients[0].execute(`PRAGMA table_info(${WRITE_RATE_LIMIT_TABLE})`);
      assert.deepEqual(
        tableInfo.rows
          .filter((row) => String(row.name) === "namespace" || String(row.name) === "bucket_key")
          .map((row) => [String(row.name), Number(row.pk)]),
        [["namespace", 1], ["bucket_key", 2]]
      );
      const rows = await harness.clients[0].execute({
        sql: `SELECT count FROM ${WRITE_RATE_LIMIT_TABLE} WHERE namespace = ?`,
        args: [getWriteRateLimitNamespace(TEST_SECRET)],
      });
      assert.equal(rows.rows.length, 1);
      assert.equal(Number(rows.rows[0].count), allowed + 1);
    } finally {
      closeHarness(harness);
    }
  }
  console.log(`fresh-init runs=30 allowed=${allowedTotal} limited=${limitedTotal} errors=${errorTotal} permitted503s=${permitted503s} maxErrorElapsedMs=${maxErrorElapsedMs}`);
});

test("window reset and Retry-After use the injected clock", async () => {
  const harness = createHarness(1);
  try {
    const store = createLibSqlWriteRateLimitStore(harness.clients[0], STORE_OPTIONS);
    const key = [{ kind: "user" as const, value: "clock-user" }];
    for (let i = 0; i < LIMIT; i += 1) {
      await store.consume(requestInput(key, 4_000));
    }
    assert.deepEqual(await store.consume(requestInput(key, 4_001)), {
      kind: "limited",
      retryAfterSec: 10,
    });
    assert.deepEqual(await store.consume(requestInput(key, 14_000)), { kind: "allowed" });
  } finally {
    closeHarness(harness);
  }
});

test("expired rows are cleaned in bounded batches and active growth stays capped", async () => {
  const harness = createHarness(1);
  try {
    const store = createLibSqlWriteRateLimitStore(harness.clients[0], {
      maxBuckets: 4,
      ...STORE_OPTIONS,
    });
    await store.consume(requestInput([{ kind: "user", value: "seed" }], 6_000));
    await harness.clients[0].batch([
      ...Array.from({ length: 120 }, (_, index) => ({
        sql: `INSERT INTO ${WRITE_RATE_LIMIT_TABLE}
              (namespace, bucket_key, count, reset_at, updated_at)
              VALUES (?, ?, 1, ?, ?)`,
        args: [getWriteRateLimitNamespace("atb-write-rate-limit-expired-key-32chars"), `${index}`.padStart(64, "0"), 0, 0],
      })),
    ]);

    await store.consume(requestInput([{ kind: "user", value: "fresh" }], 20_000));
    const count = await harness.clients[0].execute(
      `SELECT COUNT(*) AS count FROM ${WRITE_RATE_LIMIT_TABLE}`
    );
    assert.equal(Number(count.rows[0].count), 22);
    const active = await harness.clients[0].execute({
      sql: `SELECT COUNT(*) AS count FROM ${WRITE_RATE_LIMIT_TABLE} WHERE reset_at > ?`,
      args: [20_000],
    });
    assert.equal(Number(active.rows[0].count), 1);
  } finally {
    closeHarness(harness);
  }
});

test("an expired target outside cleanup does not consume active capacity, but an absent key does", async () => {
  const harness = createHarness(1);
  try {
    const store = createLibSqlWriteRateLimitStore(harness.clients[0], {
      maxBuckets: 2,
      ...STORE_OPTIONS,
    });
    const now = 21_000;
    const target = [{ kind: "user" as const, value: "expired-target" }];
    const targetDigest = digestWriteRateLimitKey(TEST_SECRET, "store-test", target[0]);

    await store.consume(requestInput([{ kind: "user", value: "schema-seed" }], now));
    await harness.clients[0].execute(`DELETE FROM ${WRITE_RATE_LIMIT_TABLE}`);
    await harness.clients[0].batch(
      Array.from({ length: 100 }, (_, index) => ({
        sql: `INSERT INTO ${WRITE_RATE_LIMIT_TABLE}
              (namespace, bucket_key, count, reset_at, updated_at)
              VALUES (?, ?, 1, ?, ?)`,
        args: [getWriteRateLimitNamespace("atb-write-rate-limit-expired-key-32chars"), `${index}`.padStart(64, "0"), 0, 0],
      }))
    );
    await harness.clients[0].execute({
      sql: `INSERT INTO ${WRITE_RATE_LIMIT_TABLE}
            (namespace, bucket_key, count, reset_at, updated_at)
            VALUES (?, ?, 9, ?, ?)`,
      args: [getWriteRateLimitNamespace(TEST_SECRET), targetDigest, now - 1, 0],
    });
    await harness.clients[0].batch([
      {
        sql: `INSERT INTO ${WRITE_RATE_LIMIT_TABLE}
              (namespace, bucket_key, count, reset_at, updated_at)
              VALUES (?, ?, 1, ?, ?)`,
        args: [getWriteRateLimitNamespace(TEST_SECRET), "active-a".padStart(64, "0"), now + WINDOW_MS, now],
      },
      {
        sql: `INSERT INTO ${WRITE_RATE_LIMIT_TABLE}
              (namespace, bucket_key, count, reset_at, updated_at)
              VALUES (?, ?, 1, ?, ?)`,
        args: [getWriteRateLimitNamespace(TEST_SECRET), "active-b".padStart(64, "0"), now + WINDOW_MS, now],
      },
    ]);

    const allowed = await store.consume(requestInput(target, now));
    assert.deepEqual(allowed, { kind: "allowed" });
    const row = await harness.clients[0].execute({
      sql: `SELECT count, reset_at, updated_at FROM ${WRITE_RATE_LIMIT_TABLE}
            WHERE namespace = ? AND bucket_key = ?`,
      args: [getWriteRateLimitNamespace(TEST_SECRET), targetDigest],
    });
    assert.equal(row.rows.length, 1);
    assert.equal(Number(row.rows[0].count), 1);
    assert.equal(Number(row.rows[0].reset_at), now + WINDOW_MS);
    assert.equal(Number(row.rows[0].updated_at), now);
    const activeBeforeAbsent = await harness.clients[0].execute({
      sql: `SELECT COUNT(*) AS count FROM ${WRITE_RATE_LIMIT_TABLE} WHERE reset_at > ?`,
      args: [now],
    });
    assert.equal(Number(activeBeforeAbsent.rows[0].count), 3);

    await assert.rejects(
      () => store.consume(requestInput([{ kind: "user", value: "absent-key" }], now)),
      /Rate-limit bucket capacity reached/
    );
  } finally {
    closeHarness(harness);
  }
});

test("production secret rotation selects a new namespace and ignores test store injection", async () => {
  const harness = createHarness(1);
  const previousUrl = process.env.TURSO_DATABASE_URL;
  const previousToken = process.env.TURSO_AUTH_TOKEN;
  const previousAuthSecret = process.env.AUTH_SECRET;
  const previousWriteSecret = process.env.WRITE_RATE_LIMIT_SECRET;
  const secretA = "atb-write-rate-limit-rotation-secret-a-32chars";
  const secretB = "atb-write-rate-limit-rotation-secret-b-32chars";
  process.env.TURSO_DATABASE_URL = harness.databaseUrl;
  process.env.TURSO_AUTH_TOKEN = "test-token";
  process.env.AUTH_SECRET = TEST_SECRET;
  process.env.WRITE_RATE_LIMIT_SECRET = secretA;
  setWriteRateLimitStoreForTests({
    async consume() {
      return { kind: "allowed" };
    },
  });
  resetTursoClientForTests();
  try {
    const subject = {
      policy: "feedback" as const,
      userId: "rotation-user",
      env: { NODE_ENV: "production" },
    };
    const request = new Request("https://anime-tier-board.vercel.app/api/feedback", {
      method: "POST",
    });
    assert.equal(await consumeWriteRateLimit(request, subject), null);
    assert.equal(getWriteRateLimitStoreCreationCountForTests(), 1);
    assert.equal(await consumeWriteRateLimit(request, subject), null);
    assert.equal(getWriteRateLimitStoreCreationCountForTests(), 1);

    process.env.WRITE_RATE_LIMIT_SECRET = secretB;
    assert.equal(await consumeWriteRateLimit(request, subject), null);
    assert.equal(getWriteRateLimitStoreCreationCountForTests(), 2);

    const rows = await harness.clients[0].execute({
      sql: `SELECT namespace, bucket_key FROM ${WRITE_RATE_LIMIT_TABLE}`,
    });
    assert.deepEqual(
      new Set(rows.rows.map((row) => `${String(row.namespace)}:${String(row.bucket_key)}`)),
      new Set([
        `${getWriteRateLimitNamespace(secretA)}:${digestWriteRateLimitKey(secretA, "feedback", { kind: "user", value: "rotation-user" })}`,
        `${getWriteRateLimitNamespace(secretB)}:${digestWriteRateLimitKey(secretB, "feedback", { kind: "user", value: "rotation-user" })}`,
      ])
    );
  } finally {
    resetTursoClientForTests();
    closeHarness(harness);
    if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = previousUrl;
    if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = previousToken;
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousAuthSecret;
    if (previousWriteSecret === undefined) delete process.env.WRITE_RATE_LIMIT_SECRET;
    else process.env.WRITE_RATE_LIMIT_SECRET = previousWriteSecret;
  }
});

test("production ignores test store injection and fails closed on missing or invalid write secret", async () => {
  const injectedAllowedStore: WriteRateLimitStore = {
    async consume() {
      return { kind: "allowed" };
    },
  };
  setWriteRateLimitStoreForTests(injectedAllowedStore);
  const previousUrl = process.env.TURSO_DATABASE_URL;
  const previousToken = process.env.TURSO_AUTH_TOKEN;
  const previousAuthSecret = process.env.AUTH_SECRET;
  const previousWriteSecret = process.env.WRITE_RATE_LIMIT_SECRET;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.AUTH_SECRET = TEST_SECRET;
  delete process.env.WRITE_RATE_LIMIT_SECRET;
  resetTursoClientForTests();
  try {
    const noOverride = await consumeWriteRateLimit(
      new Request("https://anime-tier-board.vercel.app/api/feedback", {
        headers: { "x-vercel-forwarded-for": "198.51.100.91" },
      }),
      {
        policy: "feedback",
        requireIp: true,
        env: { NODE_ENV: "production", WRITE_TRUSTED_PROXY: "vercel" },
      }
    );
    assert.equal(noOverride?.status, 503);
    assert.notEqual(noOverride && (await noOverride.json()).error, WRITE_RATE_LIMITED);

    process.env.WRITE_RATE_LIMIT_SECRET = `${TEST_SECRET} `;
    const invalid = await consumeWriteRateLimit(
      new Request("https://anime-tier-board.vercel.app/api/feedback"),
      {
        policy: "feedback",
        userId: "invalid-secret",
        env: { NODE_ENV: "production" },
      }
    );
    assert.equal(invalid?.status, 503);
  } finally {
    if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = previousUrl;
    if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = previousToken;
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousAuthSecret;
    if (previousWriteSecret === undefined) delete process.env.WRITE_RATE_LIMIT_SECRET;
    else process.env.WRITE_RATE_LIMIT_SECRET = previousWriteSecret;
    resetTursoClientForTests();
    resetWriteAdmissionForTests();
  }
});

test("SQLite busy and locked retries share one absolute deadline before and after transaction acquisition", async () => {
  const runBoundedRetry = async (
    makeLockError: () => Error & { code: string },
    keyValue: string,
    errorPhase: "acquisition" | "execution"
  ) => {
    let clock = 0;
    let transactionAttempts = 0;
    let transactionCloseCalls = 0;
    const sleeps: number[] = [];
    const client = {
      execute: async () => ({ rows: [] }),
      executeMultiple: async () => undefined,
      batch: async () => undefined,
      reconnect: () => undefined,
      transaction: async () => {
        transactionAttempts += 1;
        if (errorPhase === "acquisition") throw makeLockError();
        return {
          execute: async () => {
            throw makeLockError();
          },
          batch: async () => {
            throw makeLockError();
          },
          commit: async () => undefined,
          rollback: async () => undefined,
          close: () => {
            transactionCloseCalls += 1;
          },
          closed: false,
        };
      },
    } as unknown as Client;
    const store = createLibSqlWriteRateLimitStore(client, {
      ...STORE_OPTIONS,
      busyRetry: {
        deadlineMs: 100,
        now: () => clock,
        sleep: async (delayMs) => {
          sleeps.push(delayMs);
          clock += delayMs;
        },
      },
    });

    await assert.rejects(
      () => store.consume(requestInput([{ kind: "user", value: keyValue }], 0)),
      /SQLite busy retry deadline exceeded/
    );
    assert.equal(transactionAttempts, 5);
    assert.equal(transactionCloseCalls, errorPhase === "execution" ? 5 : 0);
    assert.deepEqual(sleeps, [5, 10, 20, 40, 25]);
    assert.equal(clock, 100);
  };

  await runBoundedRetry(
    () => Object.assign(new Error("database is busy"), { code: "SQLITE_BUSY" }),
    "busy-user",
    "acquisition"
  );
  await runBoundedRetry(
    () => Object.assign(new Error("database table is locked"), { code: "SQLITE_LOCKED" }),
    "locked-user",
    "execution"
  );
});
