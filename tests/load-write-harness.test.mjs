import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  RATE_LIMIT_RUN_HEADER,
  RATE_LIMIT_STAGE_HEADER,
  WRITE_NAMESPACE,
  startWriteFixtureServer,
  createWriteStore,
} from "../scripts/load/write-fixture-server.mjs";
import {
  WRITE_TASK_ID,
  SafetyError,
  parseWriteArgs,
  runWriteHarness,
  main as writeMain,
} from "../scripts/load/write-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS_PATH = path.join(ROOT, "scripts", "load", "write-harness.mjs");

function tempReportPath(prefix = "atb745w") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return { dir, report: path.join(dir, "report.json") };
}

function runCli(args, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HARNESS_PATH, ...args], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test("write args reject local/production/token wiring", () => {
  assert.throws(() => parseWriteArgs(["--target", "local"]), SafetyError);
  assert.throws(() => parseWriteArgs(["--target", "production"]), SafetyError);
  assert.throws(() => parseWriteArgs(["--base-url", "https://anime-tier-board.vercel.app"]), SafetyError);
  assert.throws(() => parseWriteArgs(["--token", "secret"]), SafetyError);
});

test("write fixture rejects non-test namespace and missing load-test header", async () => {
  const fx = await startWriteFixtureServer({ rateLimit: 50 });
  try {
    const noHeader = await fetch(`${fx.baseUrl}/api/load-test/items`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "k1" },
      body: JSON.stringify({ namespace: WRITE_NAMESPACE, payload: {} }),
    });
    assert.equal(noHeader.status, 403);

    const badNs = await fetch(`${fx.baseUrl}/api/load-test/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-atb-load-test": "1",
        "idempotency-key": "k2",
      },
      body: JSON.stringify({ namespace: "users", payload: {} }),
    });
    assert.equal(badNs.status, 403);

    const noKey = await fetch(`${fx.baseUrl}/api/load-test/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-atb-load-test": "1",
      },
      body: JSON.stringify({ namespace: WRITE_NAMESPACE, payload: {} }),
    });
    assert.equal(noKey.status, 400);
  } finally {
    await fx.close();
  }
});

test("write fixture idempotency replay and conflict", async () => {
  const fx = await startWriteFixtureServer({ rateLimit: 50 });
  try {
    fx.store.beginDecisionStage({ runId: "atb-run-00000000-0000-4000-8000-000000000001", stageId: "stage-1" });
    const headers = {
      "content-type": "application/json",
      "x-atb-load-test": "1",
      "idempotency-key": "same-key",
      [RATE_LIMIT_RUN_HEADER]: "atb-run-00000000-0000-4000-8000-000000000001",
      [RATE_LIMIT_STAGE_HEADER]: "stage-1",
    };
    const body = JSON.stringify({ namespace: WRITE_NAMESPACE, payload: { n: 1 } });
    const created = await fetch(`${fx.baseUrl}/api/load-test/items`, {
      method: "POST",
      headers,
      body,
    });
    assert.equal(created.status, 201);
    const first = await created.json();
    const replay = await fetch(`${fx.baseUrl}/api/load-test/items`, {
      method: "POST",
      headers,
      body,
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get("x-atb-idempotent-replay"), "1");
    const second = await replay.json();
    assert.equal(second.record.id, first.record.id);

    const conflict = await fetch(`${fx.baseUrl}/api/load-test/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({ namespace: WRITE_NAMESPACE, payload: { n: 2 } }),
    });
    assert.equal(conflict.status, 409);
  } finally {
    await fx.close();
  }
});

test("write fixture rate limit then cleanup", async () => {
  const fx = await startWriteFixtureServer({ rateLimit: 2, windowMs: 60_000 });
  try {
    fx.store.beginDecisionStage({ runId: "atb-run-00000000-0000-4000-8000-000000000001", stageId: "stage-2" });
    const post = (key) =>
      fetch(`${fx.baseUrl}/api/load-test/items`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-atb-load-test": "1",
          "idempotency-key": key,
          [RATE_LIMIT_RUN_HEADER]: "atb-run-00000000-0000-4000-8000-000000000001",
          [RATE_LIMIT_STAGE_HEADER]: "stage-2",
        },
        body: JSON.stringify({ namespace: WRITE_NAMESPACE, payload: {} }),
      });
    const first = await post("a");
    const second = await post("b");
    const third = await post("c");
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(third.status, 429);
    assert.deepEqual(
      [await first.clone().json(), await second.clone().json(), await third.clone().json()]
        .map((body) => body.rate_limit_decision),
      [
        {
          fixture_id: fx.fixtureId,
          run_id: "atb-run-00000000-0000-4000-8000-000000000001",
          stage_id: "stage-2",
          sequence: 1,
          decision: "accepted",
          status: 201,
          rate_limit: 2,
        },
        {
          fixture_id: fx.fixtureId,
          run_id: "atb-run-00000000-0000-4000-8000-000000000001",
          stage_id: "stage-2",
          sequence: 2,
          decision: "accepted",
          status: 201,
          rate_limit: 2,
        },
        {
          fixture_id: fx.fixtureId,
          run_id: "atb-run-00000000-0000-4000-8000-000000000001",
          stage_id: "stage-2",
          sequence: 3,
          decision: "rate_limited",
          status: 429,
          rate_limit: 2,
        },
      ],
    );

    const cleaned = await fetch(`${fx.baseUrl}/api/load-test/cleanup`, { method: "DELETE" });
    assert.equal(cleaned.status, 200);
    const body = await cleaned.json();
    assert.equal(body.remaining, 0);
    const listed = await fetch(`${fx.baseUrl}/api/load-test/items`);
    const list = await listed.json();
    assert.equal(list.remaining, 0);
  } finally {
    await fx.close();
  }
});

test("write store does not accept real-user ids", () => {
  const store = createWriteStore({ rateLimit: 5 });
  const result = store.create({
    key: "k",
    fingerprint: "abc",
    payload: {},
    now: Date.now(),
  });
  assert.match(result.record.id, /^atb-load-test-\d+$/);
  assert.equal(result.record.namespace, WRITE_NAMESPACE);
});

async function runWriteCase(overrides) {
  const { dir, report } = tempReportPath("write-run");
  const result = await runWriteHarness({
    target: "fixture",
    scenario: "nominal",
    concurrency: [1],
    requests: 4,
    timeout_ms: 3000,
    report,
    trustedOutputRoot: dir,
    inject: {},
    rate_limit: 50,
    ...overrides,
  });
  const disk = JSON.parse(fs.readFileSync(result.reportPath, "utf8"));
  return { result, disk };
}

test("write harness nominal concurrency steps and cleanup", async () => {
  for (const c of [1, 5]) {
    const { result, disk } = await runWriteCase({
      scenario: "nominal",
      concurrency: [c],
      requests: 4,
    });
    assert.equal(result.exitCode, 0, `concurrency ${c}`);
    assert.equal(disk.task_id, WRITE_TASK_ID);
    assert.equal(disk.family, "write");
    assert.equal(disk.remaining_after_cleanup, 0);
    assert.equal(disk.steps[0].concurrency, c);
  }
});

test("write harness idempotency records replays", async () => {
  const { result, disk } = await runWriteCase({
    scenario: "idempotency",
    concurrency: [1],
    requests: 5,
  });
  assert.equal(result.exitCode, 0);
  assert.ok(disk.idempotent_replays >= 4);
  assert.equal(disk.remaining_after_cleanup, 0);
});

test("write harness rate-limit confirms 429 then cleans up", async () => {
  const { result, disk } = await runWriteCase({
    scenario: "rate-limit",
    concurrency: [1],
    requests: 6,
    rate_limit: 2,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(disk.rate_limit_confirmed, true);
  assert.equal(disk.remaining_after_cleanup, 0);
  assert.equal(disk.stopped, false);
  assert.deepEqual(
    disk.steps[0].rate_limit_trace.map(({ sequence, decision, status, rate_limit, fixture_id, run_id, stage_id }) => ({
      sequence,
      decision,
      status,
      rate_limit,
      fixture_id,
      run_id,
      stage_id,
    })),
    [1, 2, 3].map((sequence) => ({
      sequence,
      decision: sequence <= 2 ? "accepted" : "rate_limited",
      status: sequence <= 2 ? 201 : 429,
      rate_limit: 2,
      fixture_id: disk.fixture_id,
      run_id: disk.run_id,
      stage_id: "stage-1",
    })),
  );
});

test("write harness matrix covers idempotency and rate limit", async () => {
  const { result, disk } = await runWriteCase({
    scenario: "matrix",
    concurrency: [1],
    requests: 5,
    rate_limit: 50,
  });
  assert.equal(result.exitCode, 0, disk.stop_reason);
  assert.equal(disk.rate_limit_confirmed, true);
  assert.ok(disk.idempotent_replays >= 1);
  assert.equal(disk.remaining_after_cleanup, 0);
  assert.deepEqual(
    disk.steps.map((s) => s.scenario),
    ["nominal", "idempotency", "rate-limit", "cleanup"],
  );
});

test("write harness stop: turso error", async () => {
  const { result, disk } = await runWriteCase({
    scenario: "nominal",
    inject: { turso_error: true },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(disk.stop_reason, "turso_error");
});

test("write harness stop: timeout", async () => {
  const { result, disk } = await runWriteCase({
    scenario: "nominal",
    timeout_ms: 100,
    inject: { delay_ms: 500 },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(disk.stop_reason, "timeout");
});

test("write harness stop: external amplification", async () => {
  const { result, disk } = await runWriteCase({
    scenario: "nominal",
    inject: { amplify_external: 1 },
  });
  assert.equal(result.exitCode, 1);
  assert.ok(
    disk.stop_reason === "fixture_local_external_gt_0" ||
      disk.stop_reason === "external_gt_started",
  );
});

test("write CLI rejects production and records p95 in fixture report", async () => {
  const bad = await runCli(["--target", "local"]);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /SAFETY/);

  const rel = `write-cli-${process.pid}.json`;
  const ok = await runCli([
    "--target",
    "fixture",
    "--scenario",
    "nominal",
    "--concurrency",
    "1",
    "--requests",
    "3",
    "--timeout-ms",
    "3000",
    "--report",
    rel,
  ]);
  assert.equal(ok.code, 0);
  const diskPath = path.join(ROOT, "artifacts", "load", rel);
  const disk = JSON.parse(fs.readFileSync(diskPath, "utf8"));
  assert.equal(disk.task_id, WRITE_TASK_ID);
  assert.ok(typeof disk.overall.throughput_rps === "number");
  assert.ok(disk.overall.latency_ms.p95 != null);
  assert.equal(disk.remaining_after_cleanup, 0);
  fs.unlinkSync(diskPath);
});

test("write CLI rejects absolute Windows report path", () => {
  assert.throws(
    () => parseWriteArgs(["--report", "C:\\Windows\\Temp\\atb-745-write.json"]),
    SafetyError,
  );
});

test("writeMain returns 2 on safety invalid", async () => {
  const code = await writeMain(["--target", "production"]);
  assert.equal(code, 2);
});
