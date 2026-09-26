#!/usr/bin/env node
/**
 * ATB-745-P0 — loopback-only write fixture.
 * Test-data namespace only. Rate limit + idempotency + cleanup.
 * No outbound network. Never a real-user store.
 */
import http from "node:http";
import { once } from "node:events";
import crypto from "node:crypto";

export const WRITE_NAMESPACE = "atb-load-test";
export const LOAD_TEST_HEADER = "x-atb-load-test";
export const IDEMPOTENCY_HEADER = "idempotency-key";
export const RATE_LIMIT_RUN_HEADER = "x-atb-rate-limit-run-id";
export const RATE_LIMIT_STAGE_HEADER = "x-atb-rate-limit-stage-id";
export const DEFAULT_RATE_LIMIT = 8;
export const DEFAULT_RATE_WINDOW_MS = 1000;
export const RATE_LIMIT_IDENTITY_MAX_LENGTH = 128;
const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const RATE_LIMIT_IDENTITY_RE = Object.freeze({
  fixture_id: new RegExp(`^atb-fixture-${UUID_RE}$`),
  run_id: new RegExp(`^atb-run-${UUID_RE}$`),
  stage_id: /^stage-[1-9][0-9]*$/,
});

export function isValidRateLimitIdentity(type, value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= RATE_LIMIT_IDENTITY_MAX_LENGTH &&
    RATE_LIMIT_IDENTITY_RE[type]?.test(value) === true
  );
}

export function createFixtureId() {
  const value = `atb-fixture-${crypto.randomUUID()}`;
  if (!isValidRateLimitIdentity("fixture_id", value)) {
    throw new Error("generated invalid fixture identity");
  }
  return value;
}

export function createRunId() {
  const value = `atb-run-${crypto.randomUUID()}`;
  if (!isValidRateLimitIdentity("run_id", value)) {
    throw new Error("generated invalid run identity");
  }
  return value;
}

export function createStageId(stageNumber) {
  if (!Number.isSafeInteger(stageNumber) || stageNumber < 1) {
    throw new Error("stage number must be a positive integer");
  }
  const value = `stage-${stageNumber}`;
  if (!isValidRateLimitIdentity("stage_id", value)) {
    throw new Error("generated invalid stage identity");
  }
  return value;
}

function parseIntParam(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function json(res, status, headers, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    connection: "close",
    ...headers,
  });
  res.end(payload);
}

function fingerprintBody(text) {
  return crypto.createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        reject(Object.assign(new Error("payload_too_large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createWriteStore(options = {}) {
  let rateLimit = Math.max(1, options.rateLimit ?? DEFAULT_RATE_LIMIT);
  const windowMs = Math.max(1, options.windowMs ?? DEFAULT_RATE_WINDOW_MS);
  let seq = 0;
  const items = new Map();
  const idempotency = new Map();
  const writeTimes = [];
  const fixtureId = Object.hasOwn(options, "fixtureId") ? options.fixtureId : createFixtureId();
  if (!isValidRateLimitIdentity("fixture_id", fixtureId)) {
    throw new Error("invalid fixture identity");
  }
  const decisionStages = new Map();

  function remaining() {
    return items.size;
  }

  function pruneWindow(now) {
    while (writeTimes.length && now - writeTimes[0] >= windowMs) writeTimes.shift();
  }

  function decisionStageKey(runId, stageId) {
    return `${runId}\u0000${stageId}`;
  }

  function beginDecisionStage({ runId, stageId }) {
    if (
      !isValidRateLimitIdentity("run_id", runId) ||
      !isValidRateLimitIdentity("stage_id", stageId)
    ) {
      throw new Error("invalid rate-limit trace identity");
    }
    decisionStages.set(decisionStageKey(runId, stageId), { nextSequence: 1 });
  }

  function decideRate(now, { runId, stageId }) {
    pruneWindow(now);
    const stage = decisionStages.get(decisionStageKey(runId, stageId));
    if (!stage) throw new Error("rate-limit trace stage is not initialized");
    const sequence = stage.nextSequence;
    stage.nextSequence += 1;
    const accepted = writeTimes.length < rateLimit;
    if (accepted) writeTimes.push(now);
    return {
      accepted,
      sequence,
      runId,
      stageId,
      rateLimit,
    };
  }

  function decisionRecord(decision, status) {
    return {
      fixture_id: fixtureId,
      run_id: decision.runId,
      stage_id: decision.stageId,
      sequence: decision.sequence,
      decision: decision.accepted ? "accepted" : "rate_limited",
      status,
      rate_limit: decision.rateLimit,
    };
  }

  function setRateLimit(next) {
    rateLimit = Math.max(1, Number(next) || 1);
    return rateLimit;
  }

  function resetWindow() {
    writeTimes.length = 0;
  }

  function cleanup() {
    const removed = items.size;
    items.clear();
    idempotency.clear();
    writeTimes.length = 0;
    decisionStages.clear();
    return removed;
  }

  function get(id) {
    return items.get(id) ?? null;
  }

  function list() {
    return [...items.values()];
  }

  function create({ key, fingerprint, payload, now }) {
    const existing = idempotency.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return { kind: "conflict", status: 409, record: existing.record };
      }
      return { kind: "replay", status: 200, record: existing.record };
    }
    seq += 1;
    const id = `${WRITE_NAMESPACE}-${seq}`;
    const record = {
      id,
      namespace: WRITE_NAMESPACE,
      payload: payload ?? {},
      created_at: new Date(now).toISOString(),
      idempotency_key: key,
    };
    items.set(id, record);
    idempotency.set(key, { fingerprint, record });
    return { kind: "created", status: 201, record };
  }

  return {
    fixtureId,
    get rateLimit() {
      return rateLimit;
    },
    windowMs,
    remaining,
    beginDecisionStage,
    decideRate,
    decisionRecord,
    setRateLimit,
    resetWindow,
    cleanup,
    get,
    list,
    create,
  };
}

export function createWriteFixtureRequestListener(options = {}) {
  const store = options.store ?? createWriteStore(options);
  const onRequest = options.onRequest ?? null;

  return async function listener(req, res) {
    onRequest?.(req);
    try {
      const host = req.headers.host ?? "127.0.0.1";
      const url = new URL(req.url ?? "/", `http://${host}`);

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          allow: "GET, HEAD, POST, DELETE, OPTIONS",
          "access-control-allow-origin": "*",
        });
        res.end();
        return;
      }

      if (url.pathname === "/health") {
        json(res, 200, {}, { ok: true, service: "atb-745-write-fixture" });
        return;
      }

      const delayMs = Math.max(0, parseIntParam(url.searchParams.get("delay_ms"), 0) ?? 0);
      if (delayMs > 0) await sleep(delayMs);

      const statusOverride = parseIntParam(url.searchParams.get("status"), null);
      const amplify = parseIntParam(url.searchParams.get("amplify_external"), 0) ?? 0;
      const tursoError =
        url.searchParams.get("turso_error") === "1" ||
        url.searchParams.get("turso_error") === "true";
      const malformed =
        url.searchParams.get("malformed") === "1" ||
        url.searchParams.get("malformed") === "true";

      const metricHeaders = {
        "x-atb-turso-calls": malformed ? "not-a-number" : tursoError ? "1" : "0",
        "x-atb-external-calls": malformed ? "oops" : String(amplify > 0 ? amplify : 0),
        ...(tursoError ? { "x-atb-turso-error": "1" } : {}),
      };

      if (tursoError) {
        json(res, statusOverride ?? 500, metricHeaders, {
          ok: false,
          error: "turso_error",
          metrics: { turso_calls: 1, external_calls: amplify, turso_error: true },
        });
        return;
      }

      if (statusOverride === 429) {
        json(res, 429, { ...metricHeaders, "retry-after": "1" }, {
          ok: false,
          error: "rate_limited",
          metrics: { turso_calls: 0, external_calls: amplify },
        });
        return;
      }

      if (statusOverride != null && statusOverride >= 400) {
        json(res, statusOverride, metricHeaders, {
          ok: false,
          error: "injected_error",
          metrics: { turso_calls: 0, external_calls: amplify },
        });
        return;
      }

      if (url.pathname === "/api/load-test/cleanup" && (req.method === "DELETE" || req.method === "POST")) {
        const removed = store.cleanup();
        json(res, 200, metricHeaders, {
          ok: true,
          namespace: WRITE_NAMESPACE,
          removed,
          remaining: store.remaining(),
          metrics: { turso_calls: 0, external_calls: amplify },
        });
        return;
      }

      if (url.pathname === "/api/load-test/items" && req.method === "GET") {
        const items = store.list();
        json(res, 200, metricHeaders, {
          ok: true,
          namespace: WRITE_NAMESPACE,
          remaining: items.length,
          items,
          metrics: { turso_calls: 0, external_calls: amplify },
        });
        return;
      }

      if (url.pathname.startsWith("/api/load-test/items/") && req.method === "GET") {
        const id = url.pathname.slice("/api/load-test/items/".length);
        const record = store.get(id);
        if (!record) {
          json(res, 404, metricHeaders, { ok: false, error: "not_found" });
          return;
        }
        json(res, 200, metricHeaders, {
          ok: true,
          record,
          metrics: { turso_calls: 0, external_calls: 0 },
        });
        return;
      }

      if (url.pathname === "/api/load-test/items" && req.method === "POST") {
        const loadTest = String(req.headers[LOAD_TEST_HEADER] ?? "");
        if (loadTest !== "1") {
          json(res, 403, metricHeaders, {
            ok: false,
            error: "load_test_header_required",
          });
          return;
        }

        const key = String(req.headers[IDEMPOTENCY_HEADER] ?? "").trim();
        if (!key || key.length > 128) {
          json(res, 400, metricHeaders, {
            ok: false,
            error: "idempotency_key_required",
          });
          return;
        }

        let raw = "";
        try {
          raw = await readBody(req);
        } catch (err) {
          json(res, err?.status ?? 400, metricHeaders, {
            ok: false,
            error: err?.message === "payload_too_large" ? "payload_too_large" : "body_unreadable",
          });
          return;
        }

        let parsed;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          json(res, 400, metricHeaders, { ok: false, error: "invalid_json" });
          return;
        }

        if (parsed?.namespace !== WRITE_NAMESPACE) {
          json(res, 403, metricHeaders, {
            ok: false,
            error: "namespace_forbidden",
            expected: WRITE_NAMESPACE,
          });
          return;
        }

        const runId = String(req.headers[RATE_LIMIT_RUN_HEADER] ?? "");
        const stageId = String(req.headers[RATE_LIMIT_STAGE_HEADER] ?? "");
        if (
          !isValidRateLimitIdentity("run_id", runId) ||
          !isValidRateLimitIdentity("stage_id", stageId)
        ) {
          json(res, 400, metricHeaders, {
            ok: false,
            error: "rate_limit_trace_identity_required",
          });
          return;
        }

        const now = Date.now();
        let rateDecision;
        try {
          rateDecision = store.decideRate(now, { runId, stageId });
        } catch {
          json(res, 400, metricHeaders, {
            ok: false,
            error: "rate_limit_trace_stage_required",
          });
          return;
        }
        if (!rateDecision.accepted) {
          json(res, 429, { ...metricHeaders, "retry-after": "1" }, {
            ok: false,
            error: "rate_limited",
            rate_limit: store.rateLimit,
            window_ms: store.windowMs,
            rate_limit_decision: store.decisionRecord(rateDecision, 429),
            metrics: { turso_calls: 0, external_calls: amplify },
          });
          return;
        }

        const result = store.create({
          key,
          fingerprint: fingerprintBody(raw),
          payload: parsed.payload ?? {},
          now,
        });

        if (result.kind === "conflict") {
          json(res, 409, metricHeaders, {
            ok: false,
            error: "idempotency_conflict",
            rate_limit_decision: store.decisionRecord(rateDecision, 409),
            metrics: { turso_calls: 0, external_calls: amplify },
          });
          return;
        }

        json(
          res,
          result.status,
          {
            ...metricHeaders,
            "x-atb-idempotent-replay": result.kind === "replay" ? "1" : "0",
            location: `/api/load-test/items/${result.record.id}`,
          },
          {
            ok: true,
            kind: result.kind,
            record: result.record,
            remaining: store.remaining(),
            rate_limit_decision: store.decisionRecord(rateDecision, result.status),
            metrics: { turso_calls: 0, external_calls: amplify },
          },
        );
        return;
      }

      json(res, 405, { allow: "GET, HEAD, POST, DELETE, OPTIONS" }, {
        ok: false,
        error: "method_or_path_not_allowed",
      });
    } catch (err) {
      if (!res.headersSent) {
        json(res, 500, {}, { ok: false, error: "fixture_internal_error" });
      } else {
        res.end();
      }
      void err;
    }
  };
}

export async function startWriteFixtureServer(options = {}) {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(`write fixture host must be loopback, got ${host}`);
  }
  const store = options.store ?? createWriteStore(options);
  const server = http.createServer(
    createWriteFixtureRequestListener({ ...options, store }),
  );
  server.listen(0, host);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("failed to bind write fixture server to ephemeral port");
  }
  return {
    server,
    store,
    fixtureId: store.fixtureId,
    port: address.port,
    baseUrl: `http://${host}:${address.port}`,
    close: () =>
      new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        try {
          server.close(() => done());
        } catch {
          done();
          return;
        }
        const timer = setTimeout(done, 100);
        timer.unref?.();
      }),
  };
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("write-fixture-server.mjs") ||
    process.argv[1].replaceAll("\\", "/").endsWith("scripts/load/write-fixture-server.mjs"));

if (isDirect) {
  startWriteFixtureServer({ host: "127.0.0.1" })
    .then((started) => {
      process.stdout.write(
        `${JSON.stringify({ ok: true, baseUrl: started.baseUrl, port: started.port })}\n`,
      );
      const shutdown = async () => {
        try {
          await started.close();
        } finally {
          process.exit(0);
        }
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      process.stderr.write(`${err?.stack || err}\n`);
      process.exit(2);
    });
}
