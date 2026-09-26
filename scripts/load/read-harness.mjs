#!/usr/bin/env node
/**
 * ATB-745-S1 — safe read-only load harness (fixture | local loopback only).
 * GET-only, redirect manual, no production / userinfo / env tokens / DB / live upstream.
 */
import path from "node:path";
import {
  MATRIX_ORDER,
  startFixtureServer,
} from "./fixture-server.mjs";
import { SafetyError } from "./safety-error.mjs";
import { WORKSPACE_ROOT, resolveSafeOutputPath, writeJsonAtomicSafe } from "./safe-path.mjs";

export { SafetyError };

export const TASK_ID = "ATB-745-S1-HERMES-v1";
export const DEFAULT_CONCURRENCY = Object.freeze([1, 5, 10, 25]);
export const SCENARIOS = Object.freeze(["fresh", "stale", "unavailable", "matrix"]);
export const TARGETS = Object.freeze(["fixture", "local"]);

const PRODUCTION_HOST_RE =
  /(^|\.)anime-tier-board\.vercel\.app$/i;
const BLOCKED_HOST_FRAGMENTS = [
  "vercel.app",
  "turso.io",
  "libsql.com",
  "anilist.co",
  "api.themoviedb.org",
  "jikan.moe",
  "googleapis.com",
];

export function nearestRank(sortedAscending, percentile) {
  if (!Array.isArray(sortedAscending) || sortedAscending.length === 0) return null;
  if (!(percentile > 0 && percentile <= 100)) {
    throw new RangeError("percentile must be in (0, 100]");
  }
  const n = sortedAscending.length;
  const rank = Math.ceil((percentile / 100) * n);
  return sortedAscending[Math.min(n, Math.max(1, rank)) - 1];
}

export function parseConcurrencyList(raw) {
  if (raw == null || raw === "") return [...DEFAULT_CONCURRENCY];
  const parts = String(raw)
    .split(/[,:\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [...DEFAULT_CONCURRENCY];
  const values = parts.map((p) => Number.parseInt(p, 10));
  for (const v of values) {
    if (!Number.isInteger(v) || v < 1 || v > 25) {
      throw new SafetyError(`concurrency values must be integers 1..25, got ${values}`);
    }
  }
  // Ascending unique
  return [...new Set(values)].sort((a, b) => a - b);
}

export function parsePositiveInt(raw, { min, max, name }) {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new SafetyError(`${name} must be integer ${min}..${max}, got ${raw}`);
  }
  return n;
}

function isLoopbackHostname(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1";
}

export function assertSafeUrl(urlString, { target } = {}) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new SafetyError(`invalid URL: ${urlString}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafetyError(`unsupported protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SafetyError("userinfo in URL is forbidden");
  }
  const host = url.hostname;
  const lower = host.toLowerCase();
  if (PRODUCTION_HOST_RE.test(host) || lower === "anime-tier-board.vercel.app") {
    throw new SafetyError(`production host forbidden: ${host}`);
  }
  for (const frag of BLOCKED_HOST_FRAGMENTS) {
    if (lower.includes(frag) && !isLoopbackHostname(host)) {
      throw new SafetyError(`blocked host fragment: ${frag}`);
    }
  }
  if (!isLoopbackHostname(host)) {
    throw new SafetyError(`non-loopback host forbidden: ${host}`);
  }
  if (target === "fixture" || target === "local") {
    // already loopback-only
  } else if (target != null) {
    throw new SafetyError(`target must be fixture|local, got ${target}`);
  }
  return url;
}

export function assertNoForbiddenEnvUsage(env = process.env) {
  const forbiddenKeys = [
    "DATABASE_URL",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "TMDB_API_KEY",
    "ANILIST_TOKEN",
  ];
  // Harness must not *require* or *forward* these. Presence in the shell is fine;
  // we only fail if CLI tries to inject them via explicit flags (handled in parseArgs).
  void env;
  void forbiddenKeys;
  return true;
}

export function scenarioToModes(scenario) {
  switch (scenario) {
    case "fresh":
      return ["cold_miss_fresh", "warm_hit_fresh"];
    case "stale":
      return ["warm_stale"];
    case "unavailable":
      return ["unavailable"];
    case "matrix":
      return [...MATRIX_ORDER];
    default:
      throw new SafetyError(`scenario must be ${SCENARIOS.join("|")}, got ${scenario}`);
  }
}

/** Strict non-negative safe integer. No parseInt; strings must fully match. */
export const STRICT_NONNEG_INT_RE = /^(0|[1-9]\d*)$/;

/**
 * Accept only non-negative safe integers.
 * - string: full match /^(0|[1-9]\d*)$/ then Number.isSafeInteger
 * - number: Number.isSafeInteger && >= 0 (rejects -1, 1.5, NaN, Infinity)
 * - anything else present: malformed
 * @returns {{ value: number|null, present: boolean, malformed: boolean, raw?: unknown }}
 */
export function parseStrictNonNegativeInt(raw) {
  if (raw == null) return { value: null, present: false, malformed: false };

  if (typeof raw === "number") {
    if (Number.isSafeInteger(raw) && raw >= 0) {
      return { value: raw, present: true, malformed: false, raw };
    }
    return { value: null, present: true, malformed: true, raw };
  }

  if (typeof raw === "string") {
    if (!STRICT_NONNEG_INT_RE.test(raw)) {
      return { value: null, present: true, malformed: true, raw };
    }
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0) {
      // Overflow beyond MAX_SAFE_INTEGER (e.g. "9007199254740992").
      return { value: null, present: true, malformed: true, raw };
    }
    return { value: n, present: true, malformed: false, raw };
  }

  // boolean / object / bigint / symbol → malformed if present
  return { value: null, present: true, malformed: true, raw };
}

function parseHeaderMetric(headers, name) {
  if (!headers || typeof headers.get !== "function") {
    return { value: null, present: false, malformed: false };
  }
  const raw = headers.get(name);
  if (raw == null) return { value: null, present: false, malformed: false };
  return parseStrictNonNegativeInt(raw);
}

function parseBodyMetric(body, key) {
  const raw = body?.metrics?.[key];
  if (raw === undefined) return { value: null, present: false, malformed: false };
  // JSON null is an explicit present-but-invalid metric (do not invent 0).
  if (raw === null) return { value: null, present: true, malformed: true, raw };
  return parseStrictNonNegativeInt(raw);
}

export function classifyResponse({ status, headers, body, errorKind }) {
  if (errorKind === "timeout") {
    return {
      kind: "timeout",
      status: null,
      cache: null,
      freshness: null,
      turso_calls: null,
      external_calls: null,
      turso_error: false,
      malformed_metrics: false,
    };
  }
  if (errorKind === "network") {
    return {
      kind: "network_error",
      status: null,
      cache: null,
      freshness: null,
      turso_calls: null,
      external_calls: null,
      turso_error: false,
      malformed_metrics: false,
    };
  }

  const cache = headers?.get?.("x-atb-cache") ?? body?.cache ?? null;
  const freshness = headers?.get?.("x-atb-freshness") ?? body?.freshness ?? null;
  const tursoH = parseHeaderMetric(headers, "x-atb-turso-calls");
  const externalH = parseHeaderMetric(headers, "x-atb-external-calls");
  const tursoB = parseBodyMetric(body, "turso_calls");
  const externalB = parseBodyMetric(body, "external_calls");

  // Header wins when present; body used only when header absent. Either path malformed → stop.
  let malformed_metrics = Boolean(
    tursoH.malformed ||
      externalH.malformed ||
      (!tursoH.present && tursoB.malformed) ||
      (!externalH.present && externalB.malformed),
  );

  let turso_calls = null;
  if (tursoH.present) {
    turso_calls = tursoH.malformed ? null : tursoH.value;
  } else if (tursoB.present) {
    turso_calls = tursoB.malformed ? null : tursoB.value;
  }

  let external_calls = null;
  if (externalH.present) {
    external_calls = externalH.malformed ? null : externalH.value;
  } else if (externalB.present) {
    external_calls = externalB.malformed ? null : externalB.value;
  }

  const turso_error =
    Boolean(body?.metrics?.turso_error) ||
    headers?.get?.("x-atb-turso-error") === "1" ||
    (typeof status === "number" && status >= 500 && headers?.get?.("x-atb-turso-error") === "true");

  let kind = "ok";
  if (status === 429) kind = "http_429";
  else if (typeof status === "number" && status >= 400) kind = "http_error";

  return {
    kind,
    status,
    cache,
    freshness,
    turso_calls,
    external_calls,
    turso_error,
    malformed_metrics,
  };
}

export function evaluateStop({
  target,
  started,
  results,
  signalStopped = false,
}) {
  if (signalStopped) {
    return { stop: true, reason: "signal" };
  }

  const timeouts = results.filter((r) => r.classification?.kind === "timeout").length;
  const networkErrors = results.filter((r) => r.classification?.kind === "network_error").length;
  const httpErrors = results.filter((r) => {
    const k = r.classification?.kind;
    return k === "http_error" || k === "http_429";
  }).length;
  const any429 = results.some((r) => r.classification?.kind === "http_429" || r.status === 429);
  const anyTimeout = timeouts > 0;
  const anyTursoError = results.some((r) => r.classification?.turso_error);
  const anyMalformed = results.some((r) => r.classification?.malformed_metrics);
  // Defense: negative counters must never bypass external/fixture stop rules.
  const anyNegativeCounter = results.some((r) => {
    const t = r.classification?.turso_calls;
    const e = r.classification?.external_calls;
    return (typeof t === "number" && t < 0) || (typeof e === "number" && e < 0);
  });

  const completed = results.length;
  const errorCount = timeouts + networkErrors + httpErrors;
  const errorRate = completed > 0 ? errorCount / completed : 0;

  if (anyMalformed || anyNegativeCounter) return { stop: true, reason: "malformed_metrics" };
  if (any429) return { stop: true, reason: "http_429" };
  if (anyTimeout) return { stop: true, reason: "timeout" };
  if (anyTursoError) return { stop: true, reason: "turso_error" };
  if (errorRate > 0.01) return { stop: true, reason: "error_rate_gt_1pct" };

  let externalSum = 0;
  let externalObserved = false;
  for (const r of results) {
    const v = r.classification?.external_calls;
    if (v == null) continue;
    externalObserved = true;
    externalSum += v;
  }
  if (externalObserved && externalSum > started) {
    return { stop: true, reason: "external_gt_started" };
  }
  if ((target === "fixture" || target === "local") && externalObserved && externalSum > 0) {
    return { stop: true, reason: "fixture_local_external_gt_0" };
  }

  return { stop: false, reason: null };
}

export function summarizeResults(results, { wallMs, started }) {
  const latencies = results
    .filter((r) => typeof r.latency_ms === "number" && Number.isFinite(r.latency_ms))
    .map((r) => r.latency_ms)
    .sort((a, b) => a - b);

  const statuses = {};
  const cache = {};
  const freshness = {};
  let timeouts = 0;
  let network_errors = 0;
  let http_errors = 0;
  let tursoSum = 0;
  let tursoObserved = false;
  let externalSum = 0;
  let externalObserved = false;

  for (const r of results) {
    const st = r.status == null ? "null" : String(r.status);
    statuses[st] = (statuses[st] ?? 0) + 1;
    const c = r.classification?.cache;
    if (c != null) cache[String(c)] = (cache[String(c)] ?? 0) + 1;
    const f = r.classification?.freshness;
    if (f != null) freshness[String(f)] = (freshness[String(f)] ?? 0) + 1;
    if (r.classification?.kind === "timeout") timeouts += 1;
    if (r.classification?.kind === "network_error") network_errors += 1;
    if (r.classification?.kind === "http_error" || r.classification?.kind === "http_429") {
      http_errors += 1;
    }
    if (r.classification?.turso_calls != null) {
      tursoObserved = true;
      tursoSum += r.classification.turso_calls;
    }
    if (r.classification?.external_calls != null) {
      externalObserved = true;
      externalSum += r.classification.external_calls;
    }
  }

  const errorCount = timeouts + network_errors + http_errors;
  const error_rate = results.length > 0 ? errorCount / results.length : 0;
  const throughput =
    wallMs > 0 && results.length > 0 ? (results.length / wallMs) * 1000 : 0;

  return {
    started,
    completed: results.length,
    wall_ms: wallMs,
    throughput_rps: Number(throughput.toFixed(4)),
    latency_ms: {
      p50: nearestRank(latencies, 50),
      p95: nearestRank(latencies, 95),
      p99: nearestRank(latencies, 99),
      min: latencies.length ? latencies[0] : null,
      max: latencies.length ? latencies[latencies.length - 1] : null,
      samples: latencies.length,
    },
    statuses,
    timeouts,
    network_errors,
    http_errors,
    error_rate: Number(error_rate.toFixed(6)),
    cache,
    freshness,
    turso_calls: tursoObserved ? tursoSum : null,
    external_calls: externalObserved ? externalSum : null,
  };
}

export function writeReportAtomic(filePath, report, options = {}) {
  return writeJsonAtomicSafe(filePath, report, {
    ...options,
    purpose: options.purpose ?? "test-only-report",
  });
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    target: "fixture",
    scenario: "matrix",
    concurrency: [...DEFAULT_CONCURRENCY],
    requests: 10,
    timeout_ms: 5000,
    base_url: null,
    path: "/api/anime/seasonal",
    report: path.join("artifacts", "load", "read-harness-report.json"),
    mode_query: true,
    inject: {},
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null) throw new SafetyError(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--help":
      case "-h":
        out.help = true;
        break;
      case "--target":
        out.target = next();
        break;
      case "--scenario":
        out.scenario = next();
        break;
      case "--concurrency":
        out.concurrency = parseConcurrencyList(next());
        break;
      case "--requests":
        out.requests = parsePositiveInt(next(), { min: 1, max: 500, name: "requests" });
        break;
      case "--timeout":
      case "--timeout-ms":
        out.timeout_ms = parsePositiveInt(next(), {
          min: 100,
          max: 30000,
          name: "timeout",
        });
        break;
      case "--base-url":
        out.base_url = next();
        break;
      case "--path":
        out.path = next();
        break;
      case "--report":
      case "--out":
        out.report = next();
        break;
      case "--delay-ms":
        out.inject.delay_ms = parsePositiveInt(next(), {
          min: 0,
          max: 30000,
          name: "delay-ms",
        });
        break;
      case "--inject-status":
        out.inject.status = parsePositiveInt(next(), {
          min: 100,
          max: 599,
          name: "inject-status",
        });
        break;
      case "--inject-amplify-external":
        out.inject.amplify_external = parsePositiveInt(next(), {
          min: 1,
          max: 100,
          name: "inject-amplify-external",
        });
        break;
      case "--inject-malformed":
        out.inject.malformed = true;
        break;
      case "--inject-turso-error":
        out.inject.turso_error = true;
        break;
      case "--token":
      case "--auth":
      case "--database-url":
      case "--env-file":
        throw new SafetyError(`${a} is forbidden (no env/token/DB wiring)`);
      default:
        throw new SafetyError(`unknown argument: ${a}`);
    }
  }

  if (!TARGETS.includes(out.target)) {
    throw new SafetyError(`target must be fixture|local, got ${out.target}`);
  }
  if (!SCENARIOS.includes(out.scenario)) {
    throw new SafetyError(`scenario must be ${SCENARIOS.join("|")}, got ${out.scenario}`);
  }
  if (out.target === "local" && !out.base_url) {
    out.base_url = "http://127.0.0.1:3000";
  }
  if (out.base_url) {
    assertSafeUrl(out.base_url, { target: out.target });
  }
  assertNoForbiddenEnvUsage();
  if (!out.help) {
    resolveSafeOutputPath(out.report, { workspaceRoot: WORKSPACE_ROOT });
  }
  return out;
}

function buildRequestUrl(baseUrl, apiPath, mode, inject) {
  const url = new URL(apiPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  // Prefer query mode for fixture compatibility; local may ignore unknown params.
  if (mode) url.searchParams.set("mode", mode);
  if (inject?.delay_ms) url.searchParams.set("delay_ms", String(inject.delay_ms));
  if (inject?.status) url.searchParams.set("status", String(inject.status));
  if (inject?.amplify_external) {
    url.searchParams.set("amplify_external", String(inject.amplify_external));
  }
  if (inject?.malformed) url.searchParams.set("malformed", "1");
  if (inject?.turso_error) url.searchParams.set("turso_error", "1");
  assertSafeUrl(url.toString());
  return url;
}

export async function performGet(url, { timeout_ms, signal }) {
  const started = performance.now();
  const controller = new AbortController();
  let timedOutByTimer = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOutByTimer = true;
    controller.abort();
  }, timeout_ms);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        connection: "close",
        "user-agent": "atb-745-read-harness/1.0",
      },
    });
    const latency_ms = performance.now() - started;
    let body = null;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const classification = classifyResponse({
      status: res.status,
      headers: res.headers,
      body,
    });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      latency_ms: Number(latency_ms.toFixed(3)),
      classification,
      url: url.toString(),
    };
  } catch (err) {
    const latency_ms = performance.now() - started;
    const msg = String(err?.message || err);
    // Parent/stop abort → network cancel (do not count as timeout stop reason alone).
    // Timer abort → timeout.
    const errorKind = timedOutByTimer && !signal?.aborted ? "timeout" : "network";
    const classification = classifyResponse({
      status: null,
      headers: null,
      body: null,
      errorKind,
    });
    return {
      ok: false,
      status: null,
      latency_ms: Number(latency_ms.toFixed(3)),
      classification,
      url: url.toString(),
      error: msg,
      cancelled: Boolean(signal?.aborted) && !timedOutByTimer,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function runPool({
  total,
  concurrency,
  makeRequest,
  shouldAbort,
  onResult,
}) {
  let nextIndex = 0;
  let started = 0;
  const results = [];
  const workers = [];

  async function worker() {
    while (true) {
      if (shouldAbort()) break;
      const i = nextIndex;
      if (i >= total) break;
      nextIndex += 1;
      started += 1;
      const result = await makeRequest(i);
      results.push(result);
      onResult?.(result, { started, results });
      if (shouldAbort()) break;
    }
  }

  const n = Math.min(concurrency, total);
  for (let w = 0; w < n; w += 1) workers.push(worker());
  await Promise.all(workers);
  return { results, started };
}

export async function runLoadStep({
  baseUrl,
  apiPath,
  mode,
  concurrency,
  requests,
  timeout_ms,
  inject,
  target,
  abortSignal,
  state,
}) {
  const url = buildRequestUrl(baseUrl, apiPath, mode, inject);
  const wallStarted = performance.now();
  let stopReason = null;

  const { results, started } = await runPool({
    total: requests,
    concurrency,
    shouldAbort: () => Boolean(state.stopped || abortSignal?.aborted),
    makeRequest: async () => {
      if (state.stopped || abortSignal?.aborted) {
        return {
          ok: false,
          status: null,
          latency_ms: 0,
          classification: classifyResponse({ errorKind: "network" }),
          url: url.toString(),
          skipped: true,
        };
      }
      return performGet(url, { timeout_ms, signal: abortSignal });
    },
    onResult: (_result, { started: s, results: rs }) => {
      const decision = evaluateStop({
        target,
        started: s,
        results: rs.filter((r) => !r.skipped),
        signalStopped: Boolean(state.signalStopped || abortSignal?.aborted),
      });
      if (decision.stop) {
        state.stopped = true;
        stopReason = decision.reason;
        if (state.abortController && !state.abortController.signal.aborted) {
          state.abortController.abort();
        }
      }
    },
  });

  const usable = results.filter((r) => !r.skipped);
  const wall_ms = Number((performance.now() - wallStarted).toFixed(3));
  const summary = summarizeResults(usable, { wallMs: wall_ms, started });
  return {
    mode,
    concurrency,
    requests_planned: requests,
    started,
    stop_reason: stopReason,
    summary,
    results: usable,
  };
}

export async function runHarness(options) {
  const opts = { ...options };
  const modes = scenarioToModes(opts.scenario);
  const pathOpts = {
    workspaceRoot: opts.workspaceRoot ?? WORKSPACE_ROOT,
    trustedOutputRoot: opts.trustedOutputRoot,
  };
  const reportPath = resolveSafeOutputPath(opts.report, pathOpts);
  const state = {
    stopped: false,
    abortController: new AbortController(),
  };

  let fixture = null;
  let baseUrl = opts.base_url;

  const cleanup = async () => {
    if (!fixture) return;
    const current = fixture;
    fixture = null;
    try {
      await current.close();
    } catch {
      /* ignore */
    }
    // Windows: allow http/undici handles to finish CLOSING before process.exit.
    await new Promise((resolve) => setTimeout(resolve, 200));
  };

  const onSignal = () => {
    state.stopped = true;
    state.signalStopped = true;
    if (!state.abortController.signal.aborted) state.abortController.abort();
  };
  // Windows cannot deliver catchable SIGTERM to a child process. An IPC
  // supervisor may request the identical graceful signal path instead.
  const onSupervisorMessage = (message) => {
    if (message?.signal === "SIGTERM") onSignal();
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("message", onSupervisorMessage);

  try {
    if (opts.target === "fixture") {
      fixture = await startFixtureServer({ host: "127.0.0.1" });
      baseUrl = fixture.baseUrl;
      // A machine-readable readiness event lets supervisors send signals only
      // after the owned fixture socket is listening.
      process.stdout.write(
        `${JSON.stringify({ event: "fixture_ready", baseUrl, port: fixture.port })}\n`,
      );
    } else {
      assertSafeUrl(baseUrl, { target: "local" });
    }

    const steps = [];
    const allResults = [];
    let globalStop = null;
    const harnessStartedAt = new Date().toISOString();
    const wall0 = performance.now();

    for (const concurrency of opts.concurrency) {
      if (state.stopped) break;
      for (const mode of modes) {
        if (state.stopped) break;
        const step = await runLoadStep({
          baseUrl,
          apiPath: opts.path,
          mode,
          concurrency,
          requests: opts.requests,
          timeout_ms: opts.timeout_ms,
          inject: opts.inject,
          target: opts.target,
          abortSignal: state.abortController.signal,
          state,
        });
        steps.push({
          mode: step.mode,
          concurrency: step.concurrency,
          requests_planned: step.requests_planned,
          started: step.started,
          stop_reason: step.stop_reason,
          summary: step.summary,
        });
        allResults.push(...step.results);
        if (step.stop_reason) {
          globalStop = step.stop_reason;
          state.stopped = true;
          break;
        }
        const decision = evaluateStop({
          target: opts.target,
          started: allResults.length,
          results: allResults,
          signalStopped: Boolean(state.signalStopped),
        });
        if (decision.stop) {
          globalStop = decision.reason;
          state.stopped = true;
          break;
        }
      }
    }

    if (state.signalStopped) globalStop = globalStop ?? "signal";

    const wall_ms = Number((performance.now() - wall0).toFixed(3));
    const overall = summarizeResults(allResults, {
      wallMs: wall_ms,
      started: allResults.length,
    });

    const partial = Boolean(globalStop);
    const report = {
      task_id: TASK_ID,
      target: opts.target,
      scenario: opts.scenario,
      base_url: baseUrl,
      path: opts.path,
      concurrency_steps: opts.concurrency,
      requests_per_step: opts.requests,
      timeout_ms: opts.timeout_ms,
      modes,
      started_at: harnessStartedAt,
      finished_at: new Date().toISOString(),
      partial,
      stopped: Boolean(globalStop),
      stop_reason: globalStop,
      testOnly: true,
      provenance: {
        generatedBy: "scripts/load/read-harness.mjs",
        schema: "atb-745-load-report/v1",
        task_id: TASK_ID,
        taskId: TASK_ID,
        attemptId: harnessStartedAt,
        target: opts.target,
        targetEnvironment: opts.target,
        commit: "unspecified",
        testOnly: true,
      },
      overall,
      steps,
    };

    writeReportAtomic(reportPath, report, pathOpts);
    // Remove signal handlers before closing sockets to avoid Windows shutdown races.
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("message", onSupervisorMessage);
    await cleanup();

    return {
      report,
      reportPath,
      exitCode: globalStop ? 1 : 0,
    };
  } catch (err) {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("message", onSupervisorMessage);
    await cleanup();
    if (err instanceof SafetyError) throw err;
    throw err;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("message", onSupervisorMessage);
  }
}

function printHelp() {
  process.stdout.write(
    [
      "ATB-745-S1 read load harness (fixture|local, loopback, GET-only)",
      "",
      "Usage:",
      "  node scripts/load/read-harness.mjs --target fixture --scenario matrix [options]",
      "",
      "Options:",
      "  --target fixture|local",
      "  --scenario fresh|stale|unavailable|matrix",
      "  --concurrency 1,5,10,25   (each 1..25, ascending)",
      "  --requests <1..500>",
      "  --timeout-ms <100..30000>",
      "  --base-url <loopback url>  (local default http://127.0.0.1:3000)",
      "  --path </api/anime/seasonal>",
      "  --report <path>           (atomic JSON; default artifacts/load/...)",
      "",
      "Exit: 0 ok | 1 stopped/partial | 2 safety invalid",
      "",
    ].join("\n"),
  );
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (err instanceof SafetyError) {
      process.stderr.write(`SAFETY: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
  if (opts.help) {
    printHelp();
    return 0;
  }

  try {
    const { report, reportPath, exitCode } = await runHarness(opts);
    process.stdout.write(
      `${JSON.stringify({
        ok: exitCode === 0,
        exitCode,
        reportPath,
        stopped: report.stopped,
        stop_reason: report.stop_reason,
        partial: report.partial,
        overall: report.overall,
      })}\n`,
    );
    return exitCode;
  } catch (err) {
    if (err instanceof SafetyError) {
      process.stderr.write(`SAFETY: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`${err?.stack || err}\n`);
    return 1;
  }
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("read-harness.mjs") ||
    process.argv[1].replaceAll("\\", "/").endsWith("scripts/load/read-harness.mjs"));

if (isDirect) {
  main()
    .then((code) => {
      process.exit(code ?? 0);
    })
    .catch((err) => {
      process.stderr.write(`${err?.stack || err}\n`);
      process.exit(1);
    });
}
