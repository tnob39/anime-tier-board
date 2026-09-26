#!/usr/bin/env node
/**
 * ATB-745-P0 — fixture-only write load harness.
 * Test-data namespace, rate limit, idempotency, cleanup. No production/local app writes.
 */
import path from "node:path";
import {
  DEFAULT_CONCURRENCY,
  SafetyError,
  assertSafeUrl,
  classifyResponse,
  evaluateStop,
  nearestRank,
  parseConcurrencyList,
  parsePositiveInt,
  summarizeResults,
  writeReportAtomic,
} from "./read-harness.mjs";
import {
  RATE_LIMIT_RUN_HEADER,
  RATE_LIMIT_STAGE_HEADER,
  WRITE_NAMESPACE,
  createRunId,
  createStageId,
  startWriteFixtureServer,
} from "./write-fixture-server.mjs";
import { WORKSPACE_ROOT, resolveSafeOutputPath } from "./safe-path.mjs";

export const WRITE_TASK_ID = "ATB-745-P0-WRITE";
export const WRITE_TARGETS = Object.freeze(["fixture"]);
export const WRITE_SCENARIOS = Object.freeze([
  "nominal",
  "rate-limit",
  "idempotency",
  "cleanup",
  "matrix",
]);

export { SafetyError, nearestRank };

function scenarioPlan(scenario) {
  switch (scenario) {
    case "nominal":
      return [{ name: "nominal", requests: null, uniqueKeys: true }];
    case "rate-limit":
      return [{ name: "rate-limit", requests: null, uniqueKeys: true, expect429: true }];
    case "idempotency":
      return [{ name: "idempotency", requests: null, uniqueKeys: false }];
    case "cleanup":
      return [{ name: "cleanup", requests: null, uniqueKeys: true, cleanupAfter: true }];
    case "matrix":
      return [
        { name: "nominal", uniqueKeys: true },
        { name: "idempotency", uniqueKeys: false },
        { name: "rate-limit", uniqueKeys: true, expect429: true },
        { name: "cleanup", uniqueKeys: true, cleanupAfter: true },
      ];
    default:
      throw new SafetyError(`write scenario must be ${WRITE_SCENARIOS.join("|")}`);
  }
}

export function parseWriteArgs(argv = process.argv.slice(2)) {
  const out = {
    target: "fixture",
    scenario: "matrix",
    concurrency: [...DEFAULT_CONCURRENCY],
    requests: 10,
    timeout_ms: 5000,
    report: path.join("artifacts", "load", "write-harness-report.json"),
    inject: {},
    rate_limit: 100,
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
      case "--report":
      case "--out":
        out.report = next();
        break;
      case "--rate-limit":
        out.rate_limit = parsePositiveInt(next(), {
          min: 1,
          max: 100,
          name: "rate-limit",
        });
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
      case "--base-url":
      case "--token":
      case "--auth":
      case "--database-url":
      case "--env-file":
        throw new SafetyError(`${a} is forbidden on the write harness`);
      default:
        throw new SafetyError(`unknown argument: ${a}`);
    }
  }

  if (!WRITE_TARGETS.includes(out.target)) {
    throw new SafetyError(
      `write harness is fixture-only (no local/production mutation), got ${out.target}`,
    );
  }
  if (!WRITE_SCENARIOS.includes(out.scenario)) {
    throw new SafetyError(`scenario must be ${WRITE_SCENARIOS.join("|")}, got ${out.scenario}`);
  }
  if (!out.help) {
    resolveSafeOutputPath(out.report, { workspaceRoot: WORKSPACE_ROOT });
  }
  return out;
}

function buildWriteUrl(baseUrl, pathname, inject) {
  const url = new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (inject?.delay_ms) url.searchParams.set("delay_ms", String(inject.delay_ms));
  if (inject?.status) url.searchParams.set("status", String(inject.status));
  if (inject?.amplify_external) {
    url.searchParams.set("amplify_external", String(inject.amplify_external));
  }
  if (inject?.malformed) url.searchParams.set("malformed", "1");
  if (inject?.turso_error) url.searchParams.set("turso_error", "1");
  assertSafeUrl(url.toString(), { target: "fixture" });
  return url;
}

export async function performWrite(url, { timeout_ms, signal, method, headers, body }) {
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
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        connection: "close",
        "user-agent": "atb-745-write-harness/1.0",
        ...headers,
      },
      body,
    });
    const latency_ms = performance.now() - started;
    let parsed = null;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const classification = classifyResponse({
      status: res.status,
      headers: res.headers,
      body: parsed,
    });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      latency_ms: Number(latency_ms.toFixed(3)),
      classification,
      replay: res.headers.get("x-atb-idempotent-replay") === "1",
      rate_limit_decision: parsed?.rate_limit_decision ?? null,
      record_id: parsed?.record?.id ?? parsed?.id ?? null,
      remaining: typeof parsed?.remaining === "number" ? parsed.remaining : null,
      url: url.toString(),
    };
  } catch (err) {
    const latency_ms = performance.now() - started;
    const errorKind = timedOutByTimer && !signal?.aborted ? "timeout" : "network";
    return {
      ok: false,
      status: null,
      latency_ms: Number(latency_ms.toFixed(3)),
      classification: classifyResponse({ errorKind }),
      url: url.toString(),
      error: String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function runPool({ total, concurrency, makeRequest, shouldAbort, onResult }) {
  let nextIndex = 0;
  let started = 0;
  const results = [];
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
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  return { results, started };
}

export function evaluateWriteStop({ scenarioName, expect429, ...rest }) {
  const decision = evaluateStop(rest);
  if (expect429 && decision.reason === "http_429") {
    return { ...decision, expected: true };
  }
  if (scenarioName === "idempotency" && decision.reason === "error_rate_gt_1pct") {
    // idempotency replays are 200; keep default stop rules
  }
  return { ...decision, expected: false };
}

async function cleanupFixture(baseUrl, timeout_ms, signal) {
  const url = buildWriteUrl(baseUrl, "/api/load-test/cleanup", {});
  return performWrite(url, {
    timeout_ms,
    signal,
    method: "DELETE",
    headers: { [ "x-atb-load-test" ]: "1" },
  });
}

export async function runWriteHarness(options) {
  const opts = { ...options };
  const reportPath = resolveSafeOutputPath(opts.report, {
    workspaceRoot: opts.workspaceRoot ?? WORKSPACE_ROOT,
    trustedOutputRoot: opts.trustedOutputRoot,
  });
  const state = {
    stopped: false,
    abortController: new AbortController(),
  };
  let fixture = null;

  const cleanupOwned = async () => {
    if (!fixture) return;
    const current = fixture;
    fixture = null;
    try {
      await current.close();
    } catch {
      /* ignore */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  };

  const onSignal = () => {
    state.stopped = true;
    state.signalStopped = true;
    if (!state.abortController.signal.aborted) state.abortController.abort();
  };
  const onSupervisorMessage = (message) => {
    if (message?.signal === "SIGTERM") onSignal();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("message", onSupervisorMessage);

  try {
    const baselineRateLimit = opts.rate_limit ?? 100;
    const runId = createRunId();
    fixture = await startWriteFixtureServer({
      host: "127.0.0.1",
      rateLimit: opts.scenario === "rate-limit" ? Math.min(2, baselineRateLimit) : baselineRateLimit,
      windowMs: 60_000,
    });
    const baseUrl = fixture.baseUrl;
    process.stdout.write(
      `${JSON.stringify({ event: "write_fixture_ready", baseUrl, port: fixture.port })}\n`,
    );

    const steps = [];
    const allResults = [];
    let globalStop = null;
    let rateLimitConfirmed = false;
    let idempotentReplays = 0;
    let created = 0;
    const harnessStartedAt = new Date().toISOString();
    const wall0 = performance.now();
    const plan = scenarioPlan(opts.scenario);
    let stageNumber = 0;

    for (const concurrency of opts.concurrency) {
      if (state.stopped) break;
      for (const scene of plan) {
        if (state.stopped) break;
        stageNumber += 1;
        const stageId = createStageId(stageNumber);
        if (scene.expect429) {
          fixture.store.setRateLimit(Math.min(2, baselineRateLimit));
          fixture.store.resetWindow();
        } else {
          fixture.store.setRateLimit(baselineRateLimit);
          fixture.store.resetWindow();
        }
        fixture.store.beginDecisionStage({ runId, stageId });

        const url = buildWriteUrl(baseUrl, "/api/load-test/items", opts.inject);
        const wallStarted = performance.now();
        let stopReason = null;
        const sharedKey = `atb-idem-${Date.now()}`;

        const { results, started } = await runPool({
          total: opts.requests,
          concurrency,
          shouldAbort: () => Boolean(state.stopped || state.abortController.signal.aborted),
          makeRequest: async (i) => {
            const key = scene.uniqueKeys ? `atb-key-${concurrency}-${scene.name}-${i}` : sharedKey;
            const payload = scene.uniqueKeys
              ? { scene: scene.name, i, concurrency }
              : { scene: scene.name, concurrency };
            return performWrite(url, {
              timeout_ms: opts.timeout_ms,
              signal: state.abortController.signal,
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-atb-load-test": "1",
                "idempotency-key": key,
                [RATE_LIMIT_RUN_HEADER]: runId,
                [RATE_LIMIT_STAGE_HEADER]: stageId,
              },
              body: JSON.stringify({
                namespace: WRITE_NAMESPACE,
                payload,
              }),
            });
          },
          onResult: (_result, { started: s, results: rs }) => {
            const decision = evaluateWriteStop({
              scenarioName: scene.name,
              expect429: Boolean(scene.expect429),
              target: "fixture",
              started: s,
              results: rs,
              signalStopped: Boolean(state.signalStopped),
            });
            if (decision.stop) {
              state.stopped = true;
              stopReason = decision.reason;
              if (!decision.expected && !state.abortController.signal.aborted) {
                state.abortController.abort();
              }
            }
          },
        });

        for (const r of results) {
          if (r.replay) idempotentReplays += 1;
          if (r.status === 201) created += 1;
          if (r.status === 429) rateLimitConfirmed = true;
        }

        const wall_ms = Number((performance.now() - wallStarted).toFixed(3));
        const summary = summarizeResults(results, { wallMs: wall_ms, started });
        const expectedStop = Boolean(scene.expect429 && stopReason === "http_429");
        const rateLimitTrace = scene.expect429
          ? results
            .map((result) => result.rate_limit_decision)
            .filter((decision) => decision !== null)
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
          : null;
        steps.push({
          family: "write",
          scenario: scene.name,
          concurrency,
          // Threshold semantics: the fixture accepts exactly rate_limit writes
          // in its window, then returns 429 and the harness stops that scene.
          rate_limit: scene.expect429 ? fixture.store.rateLimit : null,
          requests_planned: opts.requests,
          started,
          stop_reason: stopReason,
          expected_stop: expectedStop,
          ...(scene.expect429 ? { stage_id: stageId, rate_limit_trace: rateLimitTrace } : {}),
          summary,
        });
        allResults.push(...results);

        if (stopReason && !expectedStop) {
          globalStop = stopReason;
          state.stopped = true;
          break;
        }
        if (expectedStop) {
          state.stopped = false;
        }
        fixture.store.setRateLimit(baselineRateLimit);
        fixture.store.resetWindow();
      }
    }

    const cleanupResult = await cleanupFixture(baseUrl, opts.timeout_ms, undefined);
    const remainingAfterCleanup = cleanupResult.ok ? (cleanupResult.remaining ?? 0) : null;

    if (state.signalStopped) globalStop = globalStop ?? "signal";

    const wall_ms = Number((performance.now() - wall0).toFixed(3));
    const overall = summarizeResults(allResults, {
      wallMs: wall_ms,
      started: allResults.length,
    });
    overall.created = created;
    overall.idempotent_replays = idempotentReplays;
    overall.rate_limit_confirmed = rateLimitConfirmed;
    overall.cleanup_ok = Boolean(cleanupResult.ok);
    overall.remaining_after_cleanup = remainingAfterCleanup;

    const cleanupFailed = remainingAfterCleanup !== 0;
    if (cleanupFailed) globalStop = globalStop ?? "cleanup_incomplete";

    const report = {
      task_id: WRITE_TASK_ID,
      family: "write",
      target: "fixture",
      scenario: opts.scenario,
      namespace: WRITE_NAMESPACE,
      concurrency_steps: opts.concurrency,
      requests_per_step: opts.requests,
      timeout_ms: opts.timeout_ms,
      fixture_id: fixture.fixtureId,
      run_id: runId,
      started_at: harnessStartedAt,
      finished_at: new Date().toISOString(),
      partial: Boolean(globalStop),
      stopped: Boolean(globalStop),
      stop_reason: globalStop,
      rate_limit_confirmed: rateLimitConfirmed,
      idempotent_replays: idempotentReplays,
      remaining_after_cleanup: remainingAfterCleanup,
      testOnly: true,
      provenance: {
        generatedBy: "scripts/load/write-harness.mjs",
        schema: "atb-745-load-report/v1",
        task_id: WRITE_TASK_ID,
        taskId: WRITE_TASK_ID,
        attemptId: harnessStartedAt,
        fixture_id: fixture.fixtureId,
        run_id: runId,
        target: "fixture",
        targetEnvironment: "fixture",
        commit: "unspecified",
        testOnly: true,
      },
      overall,
      steps,
    };
    writeReportAtomic(reportPath, report, {
      workspaceRoot: opts.workspaceRoot ?? WORKSPACE_ROOT,
      trustedOutputRoot: opts.trustedOutputRoot,
    });

    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("message", onSupervisorMessage);
    await cleanupOwned();

    let exitCode = 0;
    if (globalStop) exitCode = 1;
    if (opts.scenario === "rate-limit" && !rateLimitConfirmed) exitCode = 1;
    if (opts.scenario === "matrix" && !rateLimitConfirmed) exitCode = 1;
    if (opts.scenario === "idempotency" && idempotentReplays < 1 && opts.requests > 1) exitCode = 1;
    if (opts.scenario === "matrix" && opts.requests > 1 && idempotentReplays < 1) exitCode = 1;
    if (cleanupFailed) exitCode = 1;

    return { report, reportPath, exitCode };
  } catch (err) {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("message", onSupervisorMessage);
    await cleanupOwned();
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
      "ATB-745-P0 write load harness (fixture-only, test-data namespace)",
      "",
      "Usage:",
      "  node scripts/load/write-harness.mjs --target fixture --scenario matrix [options]",
      "",
      "Write target is fixture only. Local/production mutation is forbidden.",
      "Cleanup always runs. Namespace is atb-load-test.",
      "",
    ].join("\n"),
  );
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseWriteArgs(argv);
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
    const { report, reportPath, exitCode } = await runWriteHarness(opts);
    process.stdout.write(
      `${JSON.stringify({
        ok: exitCode === 0,
        exitCode,
        reportPath,
        stopped: report.stopped,
        stop_reason: report.stop_reason,
        rate_limit_confirmed: report.rate_limit_confirmed,
        remaining_after_cleanup: report.remaining_after_cleanup,
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
  (process.argv[1].endsWith("write-harness.mjs") ||
    process.argv[1].replaceAll("\\", "/").endsWith("scripts/load/write-harness.mjs"));

if (isDirect) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((err) => {
      process.stderr.write(`${err?.stack || err}\n`);
      process.exit(1);
    });
}
