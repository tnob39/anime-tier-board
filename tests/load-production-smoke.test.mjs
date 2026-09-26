import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CANONICAL_PRODUCTION_ORIGIN,
  MAX_SMOKE_REQUESTS,
  SMOKE_TASK_ID,
  SafetyError,
  assertProductionSmokeUrl,
  assertSmokeExecutionBoundary,
  parseSmokeArgs,
  runProductionSmoke,
  main as smokeMain,
} from "../scripts/load/production-smoke.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempReport(prefix = "atb745s") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return { dir, report: path.join(dir, "report.json") };
}

test("production smoke URL allowlist is canonical GET path only", () => {
  assert.ok(assertProductionSmokeUrl(`${CANONICAL_PRODUCTION_ORIGIN}/api/anime/seasonal`));
  assert.throws(
    () => assertProductionSmokeUrl("http://anime-tier-board.vercel.app/api/anime/seasonal"),
    /https/i,
  );
  assert.throws(
    () => assertProductionSmokeUrl("https://example.vercel.app/api/anime/seasonal"),
    /canonical/i,
  );
  assert.throws(
    () => assertProductionSmokeUrl(`${CANONICAL_PRODUCTION_ORIGIN}/api/statuses`),
    /allowlisted/i,
  );
  assert.throws(
    () => assertProductionSmokeUrl("https://user:pass@anime-tier-board.vercel.app/api/anime/seasonal"),
    /userinfo/i,
  );
});

test("parseSmokeArgs disabled by default and rejects unsafe flags", () => {
  const def = parseSmokeArgs([]);
  assert.equal(def.allow, false);
  assert.equal(def.execute, false);
  assert.equal(def.requests, 1);
  assert.throws(() => parseSmokeArgs(["--concurrency", "5"]), SafetyError);
  assert.throws(() => parseSmokeArgs(["--token", "x"]), SafetyError);
  assert.throws(() => parseSmokeArgs(["--path", "/api/shares"]), SafetyError);
  assert.throws(() => parseSmokeArgs(["--requests", String(MAX_SMOKE_REQUESTS + 1)]), SafetyError);
  assert.throws(() => parseSmokeArgs(["--base-url", CANONICAL_PRODUCTION_ORIGIN]), SafetyError);
});

test("default run does not execute and exits 2", async () => {
  const { dir, report } = tempReport("disabled");
  const result = await runProductionSmoke({
    allow: false,
    execute: false,
    requests: 1,
    timeout_ms: 1000,
    path: "/api/anime/seasonal",
    report,
    trustedOutputRoot: dir,
    fetchImpl: async () => {
      throw new Error("network must not be used");
    },
  });
  assert.equal(result.exitCode, 2);
  const disk = JSON.parse(fs.readFileSync(report, "utf8"));
  assert.equal(disk.task_id, SMOKE_TASK_ID);
  assert.equal(disk.enabled, false);
  assert.equal(disk.executed, false);
  assert.equal(disk.reason, "disabled_by_default");
  assert.equal(disk.plan.concurrency, 1);
  assert.equal(disk.plan.method, "GET");
});

test("allow without execute is dry-run", async () => {
  const { dir, report } = tempReport("dry");
  let called = 0;
  const result = await runProductionSmoke({
    allow: true,
    execute: false,
    requests: 1,
    timeout_ms: 1000,
    path: "/api/anime/seasonal",
    report,
    trustedOutputRoot: dir,
    fetchImpl: async () => {
      called += 1;
      throw new Error("dry-run must not fetch");
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(called, 0);
  const disk = JSON.parse(fs.readFileSync(report, "utf8"));
  assert.equal(disk.executed, false);
  assert.equal(disk.reason, "dry_run");
});

test("execute with mock fetch records metrics and stays GET concurrency 1", async () => {
  const { dir, report } = tempReport("exec");
  const calls = [];
  const result = await runProductionSmoke({
    allow: true,
    execute: true,
    requests: 2,
    timeout_ms: 1000,
    path: "/api/anime/seasonal",
    report,
    trustedOutputRoot: dir,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      return {
        status: 200,
        headers: new Headers({
          "x-atb-cache": "hit",
          "x-atb-freshness": "fresh",
          "x-atb-turso-calls": "0",
          "x-atb-external-calls": "0",
        }),
        text: async () =>
          JSON.stringify({
            ok: true,
            cache: "hit",
            freshness: "fresh",
            metrics: { turso_calls: 0, external_calls: 0 },
          }),
      };
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.method === "GET"));
  assert.ok(calls.every((c) => c.url === `${CANONICAL_PRODUCTION_ORIGIN}/api/anime/seasonal`));
  const disk = JSON.parse(fs.readFileSync(report, "utf8"));
  assert.equal(disk.executed, true);
  assert.equal(disk.plan.concurrency, 1);
  assert.equal(disk.overall.completed, 2);
  assert.equal(disk.overall.latency_ms.p50 != null, true);
});

test("execute stops after first failure", async () => {
  const { dir, report } = tempReport("fail");
  let calls = 0;
  const result = await runProductionSmoke({
    allow: true,
    execute: true,
    requests: 5,
    timeout_ms: 1000,
    path: "/api/anime/seasonal",
    report,
    trustedOutputRoot: dir,
    fetchImpl: async () => {
      calls += 1;
      return {
        status: 500,
        headers: new Headers({ "x-atb-turso-error": "1" }),
        text: async () => JSON.stringify({ ok: false, metrics: { turso_error: true } }),
      };
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(calls, 1);
  const disk = JSON.parse(fs.readFileSync(report, "utf8"));
  assert.equal(disk.stopped, true);
});

test("runProductionSmoke rejects requests 6 and unsafe target before fetch", async () => {
  const { dir, report } = tempReport("boundary");
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    throw new Error("must not fetch");
  };
  await assert.rejects(
    () =>
      runProductionSmoke({
        allow: true,
        execute: true,
        requests: 6,
        path: "/api/anime/seasonal",
        report,
        trustedOutputRoot: dir,
        fetchImpl,
      }),
    SafetyError,
  );
  await assert.rejects(
    () =>
      runProductionSmoke({
        allow: true,
        execute: true,
        requests: 1,
        target: "https://evil.example",
        path: "/api/anime/seasonal",
        report,
        trustedOutputRoot: dir,
        fetchImpl,
      }),
    /target override/i,
  );
  await assert.rejects(
    () =>
      runProductionSmoke({
        allow: true,
        execute: true,
        requests: 1,
        path: "/api/statuses",
        report,
        trustedOutputRoot: dir,
        fetchImpl,
      }),
    SafetyError,
  );
  assert.equal(called, 0);
  assert.throws(
    () => assertSmokeExecutionBoundary({ allow: true, execute: true, requests: 6 }),
    SafetyError,
  );
});

test("smokeMain without flags is disabled", async () => {
  const rel = `smoke-disabled-${process.pid}.json`;
  const code = await smokeMain(["--report", rel]);
  assert.equal(code, 2);
  const diskPath = path.join(ROOT, "artifacts", "load", rel);
  assert.equal(JSON.parse(fs.readFileSync(diskPath, "utf8")).executed, false);
  fs.unlinkSync(diskPath);
});
