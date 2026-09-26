#!/usr/bin/env node
/**
 * ATB-745-P0 — production read smoke.
 * Disabled by default. Concurrency 1, GET-only, allowlisted path, no tokens.
 * Never mutates. Never runs without --allow-production-smoke --execute.
 */
import path from "node:path";
import {
  SafetyError,
  classifyResponse,
  summarizeResults,
  writeReportAtomic,
  parsePositiveInt,
} from "./read-harness.mjs";
import { WORKSPACE_ROOT, resolveSafeOutputPath } from "./safe-path.mjs";

export const SMOKE_TASK_ID = "ATB-745-P0-PROD-SMOKE";
export const CANONICAL_PRODUCTION_ORIGIN = "https://anime-tier-board.vercel.app";
export const ALLOWED_SMOKE_PATHS = Object.freeze(["/api/anime/seasonal"]);
export const MAX_SMOKE_REQUESTS = 5;
export const SMOKE_CONCURRENCY = 1;

export { SafetyError };

export function assertProductionSmokeUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new SafetyError(`invalid URL: ${urlString}`);
  }
  if (url.protocol !== "https:") {
    throw new SafetyError("production smoke requires https");
  }
  if (url.username || url.password) {
    throw new SafetyError("userinfo in URL is forbidden");
  }
  if (url.origin !== CANONICAL_PRODUCTION_ORIGIN) {
    throw new SafetyError("production smoke host is not the canonical origin");
  }
  if (!ALLOWED_SMOKE_PATHS.includes(url.pathname)) {
    throw new SafetyError(`path is not allowlisted for production smoke: ${url.pathname}`);
  }
  if (url.search && url.searchParams.get("mode")) {
    throw new SafetyError("production smoke must not send fixture injection query params");
  }
  return url;
}

export function parseSmokeArgs(argv = process.argv.slice(2)) {
  const out = {
    allow: false,
    execute: false,
    requests: 1,
    timeout_ms: 8000,
    path: ALLOWED_SMOKE_PATHS[0],
    report: path.join("artifacts", "load", "production-smoke-report.json"),
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
      case "--allow-production-smoke":
        out.allow = true;
        break;
      case "--execute":
        out.execute = true;
        break;
      case "--requests":
        out.requests = parsePositiveInt(next(), {
          min: 1,
          max: MAX_SMOKE_REQUESTS,
          name: "requests",
        });
        break;
      case "--timeout":
      case "--timeout-ms":
        out.timeout_ms = parsePositiveInt(next(), {
          min: 100,
          max: 15000,
          name: "timeout",
        });
        break;
      case "--path":
        out.path = next();
        break;
      case "--report":
      case "--out":
        out.report = next();
        break;
      case "--concurrency":
        throw new SafetyError("production smoke concurrency is fixed at 1");
      case "--target":
      case "--base-url":
      case "--token":
      case "--auth":
      case "--database-url":
      case "--env-file":
      case "--inject-status":
      case "--inject-amplify-external":
        throw new SafetyError(`${a} is forbidden on production smoke`);
      default:
        throw new SafetyError(`unknown argument: ${a}`);
    }
  }

  if (!ALLOWED_SMOKE_PATHS.includes(out.path)) {
    throw new SafetyError(`path is not allowlisted for production smoke: ${out.path}`);
  }
  if (!out.help) {
    resolveSafeOutputPath(out.report, { workspaceRoot: WORKSPACE_ROOT });
  }
  return out;
}

export function assertSmokeExecutionBoundary(opts = {}) {
  if (opts.target != null) {
    throw new SafetyError("production smoke target override is forbidden");
  }
  if (opts.base_url != null || opts.origin != null || opts.url != null) {
    throw new SafetyError("production smoke URL override is forbidden");
  }
  if (
    opts.concurrency != null &&
    opts.concurrency !== SMOKE_CONCURRENCY &&
    opts.concurrency !== 1
  ) {
    throw new SafetyError("production smoke concurrency is fixed at 1");
  }

  const requests = opts.requests ?? 1;
  if (!Number.isInteger(requests) || requests < 1 || requests > MAX_SMOKE_REQUESTS) {
    throw new SafetyError(
      `production smoke requests must be integer 1..${MAX_SMOKE_REQUESTS}`,
    );
  }

  const smokePath = opts.path ?? ALLOWED_SMOKE_PATHS[0];
  if (!ALLOWED_SMOKE_PATHS.includes(smokePath)) {
    throw new SafetyError(`path is not allowlisted for production smoke: ${smokePath}`);
  }
  assertProductionSmokeUrl(`${CANONICAL_PRODUCTION_ORIGIN}${smokePath}`);

  return {
    allow: opts.allow === true,
    execute: opts.execute === true,
    requests,
    path: smokePath,
    concurrency: SMOKE_CONCURRENCY,
    timeout_ms: opts.timeout_ms ?? 8000,
  };
}

export function buildSmokePlan(opts) {
  const boundary = assertSmokeExecutionBoundary(opts);
  const url = assertProductionSmokeUrl(`${CANONICAL_PRODUCTION_ORIGIN}${boundary.path}`);
  return {
    origin: CANONICAL_PRODUCTION_ORIGIN,
    path: url.pathname,
    method: "GET",
    concurrency: SMOKE_CONCURRENCY,
    requests: boundary.requests,
    timeout_ms: boundary.timeout_ms,
    redirect: "manual",
    headers: {
      accept: "application/json",
      "user-agent": "atb-745-production-smoke/1.0",
    },
  };
}

export async function runProductionSmoke(options) {
  const opts = { ...options };
  const boundary = assertSmokeExecutionBoundary(opts);
  const pathOpts = {
    workspaceRoot: opts.workspaceRoot ?? WORKSPACE_ROOT,
    trustedOutputRoot: opts.trustedOutputRoot,
  };
  const reportPath = resolveSafeOutputPath(opts.report, pathOpts);
  const plan = {
    origin: CANONICAL_PRODUCTION_ORIGIN,
    path: boundary.path,
    method: "GET",
    concurrency: SMOKE_CONCURRENCY,
    requests: boundary.requests,
    timeout_ms: boundary.timeout_ms,
    redirect: "manual",
    headers: {
      accept: "application/json",
      "user-agent": "atb-745-production-smoke/1.0",
    },
  };
  const startedAt = new Date().toISOString();

  if (!boundary.allow) {
    const report = {
      task_id: SMOKE_TASK_ID,
      family: "production_smoke",
      enabled: false,
      executed: false,
      reason: "disabled_by_default",
      plan,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      target: "production",
      testOnly: true,
      provenance: {
        generatedBy: "scripts/load/production-smoke.mjs",
        schema: "atb-745-load-report/v1",
        task_id: SMOKE_TASK_ID,
        taskId: SMOKE_TASK_ID,
        attemptId: startedAt,
        target: "production",
        targetEnvironment: "production",
        commit: "unspecified",
        testOnly: true,
      },
    };
    writeReportAtomic(reportPath, report, pathOpts);
    return { report, reportPath, exitCode: 2 };
  }

  if (!boundary.execute) {
    const report = {
      task_id: SMOKE_TASK_ID,
      family: "production_smoke",
      enabled: true,
      executed: false,
      reason: "dry_run",
      plan,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      target: "production",
      testOnly: true,
      provenance: {
        generatedBy: "scripts/load/production-smoke.mjs",
        schema: "atb-745-load-report/v1",
        task_id: SMOKE_TASK_ID,
        taskId: SMOKE_TASK_ID,
        attemptId: startedAt,
        target: "production",
        targetEnvironment: "production",
        commit: "unspecified",
        testOnly: true,
      },
    };
    writeReportAtomic(reportPath, report, pathOpts);
    return { report, reportPath, exitCode: 0 };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const results = [];
  const wall0 = performance.now();
  for (let i = 0; i < boundary.requests; i += 1) {
    const t0 = performance.now();
    try {
      const res = await fetchImpl(plan.origin + plan.path, {
        method: "GET",
        redirect: "manual",
        headers: plan.headers,
        signal: AbortSignal.timeout(plan.timeout_ms),
      });
      const text = await res.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      results.push({
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        latency_ms: Number((performance.now() - t0).toFixed(3)),
        classification: classifyResponse({
          status: res.status,
          headers: res.headers,
          body,
        }),
      });
    } catch (err) {
      const timedOut = /timeout|aborted/i.test(String(err?.name || err?.message || err));
      results.push({
        ok: false,
        status: null,
        latency_ms: Number((performance.now() - t0).toFixed(3)),
        classification: classifyResponse({
          errorKind: timedOut ? "timeout" : "network",
        }),
        error: String(err?.message || err),
      });
    }
    if (results.some((r) => r.classification?.kind !== "ok")) break;
  }

  const wall_ms = Number((performance.now() - wall0).toFixed(3));
  const overall = summarizeResults(results, { wallMs: wall_ms, started: results.length });
  const failed = results.some((r) => !r.ok);
  const report = {
    task_id: SMOKE_TASK_ID,
    family: "production_smoke",
    enabled: true,
    executed: true,
    reason: failed ? "smoke_failed" : null,
    plan,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    stopped: failed,
    stop_reason: failed ? (results.at(-1)?.classification?.kind ?? "smoke_failed") : null,
    overall,
    target: "production",
    testOnly: true,
    provenance: {
      generatedBy: "scripts/load/production-smoke.mjs",
      schema: "atb-745-load-report/v1",
      task_id: SMOKE_TASK_ID,
      taskId: SMOKE_TASK_ID,
      attemptId: startedAt,
      target: "production",
      targetEnvironment: "production",
      commit: "unspecified",
      testOnly: true,
    },
  };
  writeReportAtomic(reportPath, report, pathOpts);
  return { report, reportPath, exitCode: failed ? 1 : 0 };
}

function printHelp() {
  process.stdout.write(
    [
      "ATB-745-P0 production read smoke (disabled by default)",
      "",
      "  node scripts/load/production-smoke.mjs",
      "    → SAFETY, exit 2, no network",
      "  node scripts/load/production-smoke.mjs --allow-production-smoke",
      "    → dry-run plan, no network",
      "  node scripts/load/production-smoke.mjs --allow-production-smoke --execute",
      "    → GET-only concurrency 1, max 5 requests, canonical origin only",
      "",
    ].join("\n"),
  );
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseSmokeArgs(argv);
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
    const { report, reportPath, exitCode } = await runProductionSmoke(opts);
    if (!opts.allow) {
      process.stderr.write("SAFETY: production smoke is disabled by default\n");
    }
    process.stdout.write(
      `${JSON.stringify({
        ok: exitCode === 0,
        exitCode,
        reportPath,
        enabled: report.enabled,
        executed: report.executed,
        reason: report.reason,
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
  (process.argv[1].endsWith("production-smoke.mjs") ||
    process.argv[1].replaceAll("\\", "/").endsWith("scripts/load/production-smoke.mjs"));

if (isDirect) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((err) => {
      process.stderr.write(`${err?.stack || err}\n`);
      process.exit(1);
    });
}
