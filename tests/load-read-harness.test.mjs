import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FIXTURE_MODES,
  MATRIX_ORDER,
  startFixtureServer,
  buildFixturePayload,
} from "../scripts/load/fixture-server.mjs";
import {
  DEFAULT_CONCURRENCY,
  SafetyError,
  assertSafeUrl,
  classifyResponse,
  evaluateStop,
  main as harnessMain,
  nearestRank,
  parseArgs,
  parseConcurrencyList,
  parseStrictNonNegativeInt,
  performGet,
  runHarness,
  scenarioToModes,
  summarizeResults,
  writeReportAtomic,
} from "../scripts/load/read-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS_PATH = path.join(ROOT, "scripts", "load", "read-harness.mjs");

function tempReportPath(prefix = "atb745") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return path.join(dir, "report.json");
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
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test("nearest-rank p50/p95/p99", () => {
  const sample = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(nearestRank(sample, 50), 50);
  assert.equal(nearestRank(sample, 95), 100);
  assert.equal(nearestRank(sample, 99), 100);
  assert.equal(nearestRank([7], 50), 7);
  assert.equal(nearestRank([], 50), null);
});

test("concurrency list ascending unique within 1..25; default 1,5,10,25", () => {
  assert.deepEqual(parseConcurrencyList(undefined), [1, 5, 10, 25]);
  assert.deepEqual(DEFAULT_CONCURRENCY, [1, 5, 10, 25]);
  assert.deepEqual(parseConcurrencyList("25,1,10,5,5"), [1, 5, 10, 25]);
  assert.throws(() => parseConcurrencyList("0"), SafetyError);
  assert.throws(() => parseConcurrencyList("26"), SafetyError);
});

test("scenario modes and matrix order", () => {
  assert.deepEqual(scenarioToModes("fresh"), ["cold_miss_fresh", "warm_hit_fresh"]);
  assert.deepEqual(scenarioToModes("stale"), ["warm_stale"]);
  assert.deepEqual(scenarioToModes("unavailable"), ["unavailable"]);
  assert.deepEqual(scenarioToModes("matrix"), [...MATRIX_ORDER]);
  assert.deepEqual(MATRIX_ORDER, [
    "cold_miss_fresh",
    "warm_hit_fresh",
    "warm_stale",
    "unavailable",
  ]);
});

test("assertSafeUrl rejects production / userinfo / non-loopback before fetch", () => {
  assert.throws(
    () => assertSafeUrl("https://anime-tier-board.vercel.app/api/anime/seasonal"),
    /production|non-loopback|forbidden/i,
  );
  assert.throws(
    () => assertSafeUrl("https://user:pass@127.0.0.1:3000/api"),
    /userinfo/i,
  );
  assert.throws(() => assertSafeUrl("https://example.com/"), /loopback|forbidden/i);
  assert.ok(assertSafeUrl("http://127.0.0.1:3456/api/anime/seasonal"));
  assert.ok(assertSafeUrl("http://localhost:3000/"));
});

test("parseArgs rejects production base-url and forbidden token flags", () => {
  assert.throws(
    () =>
      parseArgs([
        "--target",
        "local",
        "--base-url",
        "https://anime-tier-board.vercel.app",
      ]),
    SafetyError,
  );
  assert.throws(() => parseArgs(["--token", "secret"]), SafetyError);
  assert.throws(() => parseArgs(["--target", "production"]), SafetyError);
});

test("classifyResponse reads cache/freshness/counters; null when unobservable", () => {
  const headers = new Headers({
    "x-atb-cache": "hit",
    "x-atb-freshness": "fresh",
    "x-atb-turso-calls": "0",
    "x-atb-external-calls": "0",
  });
  const c = classifyResponse({
    status: 200,
    headers,
    body: { metrics: { turso_calls: 0, external_calls: 0 } },
  });
  assert.equal(c.cache, "hit");
  assert.equal(c.freshness, "fresh");
  assert.equal(c.turso_calls, 0);
  assert.equal(c.external_calls, 0);

  const missing = classifyResponse({ status: 200, headers: new Headers(), body: {} });
  assert.equal(missing.turso_calls, null);
  assert.equal(missing.external_calls, null);

  const malformed = classifyResponse({
    status: 200,
    headers: new Headers({
      "x-atb-turso-calls": "NaN",
      "x-atb-external-calls": "x",
    }),
    body: {},
  });
  assert.equal(malformed.malformed_metrics, true);
});

test("parseStrictNonNegativeInt accepts only non-negative safe integers", () => {
  assert.deepEqual(parseStrictNonNegativeInt(0), {
    value: 0,
    present: true,
    malformed: false,
    raw: 0,
  });
  assert.deepEqual(parseStrictNonNegativeInt(42), {
    value: 42,
    present: true,
    malformed: false,
    raw: 42,
  });
  assert.deepEqual(parseStrictNonNegativeInt("0"), {
    value: 0,
    present: true,
    malformed: false,
    raw: "0",
  });
  assert.deepEqual(parseStrictNonNegativeInt("12"), {
    value: 12,
    present: true,
    malformed: false,
    raw: "12",
  });

  for (const bad of [
    -1,
    -0.1,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    "01",
    "-1",
    "1.5",
    "1junk",
    "NaN",
    " ",
    "",
    "+1",
    "0x10",
    "9007199254740992", // > MAX_SAFE_INTEGER
    true,
    false,
    {},
    [],
  ]) {
    const got = parseStrictNonNegativeInt(bad);
    assert.equal(got.present, true, `present for ${String(bad)}`);
    assert.equal(got.malformed, true, `malformed for ${String(bad)}`);
    assert.equal(got.value, null, `value null for ${String(bad)}`);
  }
  assert.equal(parseStrictNonNegativeInt(null).present, false);
  assert.equal(parseStrictNonNegativeInt(undefined).present, false);
});

test("header metric path: junk/negative/decimal/overflow → malformed_metrics", () => {
  const cases = [
    { turso: "-1", external: "0" },
    { turso: "0", external: "-3" },
    { turso: "1.5", external: "0" },
    { turso: "1junk", external: "0" },
    { turso: "NaN", external: "1" },
    { turso: "01", external: "0" },
    { turso: "9007199254740992", external: "0" },
    { turso: "0", external: "1.0" },
  ];
  for (const c of cases) {
    const got = classifyResponse({
      status: 200,
      headers: new Headers({
        "x-atb-turso-calls": c.turso,
        "x-atb-external-calls": c.external,
      }),
      body: { metrics: { turso_calls: 0, external_calls: 0 } },
    });
    assert.equal(
      got.malformed_metrics,
      true,
      `header turso=${c.turso} external=${c.external}`,
    );
    assert.equal(
      evaluateStop({
        target: "fixture",
        started: 1,
        results: [{ status: 200, classification: got }],
      }).reason,
      "malformed_metrics",
    );
  }
});

test("body metric path: junk/negative/decimal/overflow → malformed_metrics", () => {
  const cases = [
    { turso_calls: -1, external_calls: 0 },
    { turso_calls: 0, external_calls: -5 },
    { turso_calls: 1.5, external_calls: 0 },
    { turso_calls: "1junk", external_calls: 0 },
    { turso_calls: "NaN", external_calls: 0 },
    { turso_calls: "01", external_calls: 0 },
    { turso_calls: "9007199254740992", external_calls: 0 },
    { turso_calls: null, external_calls: 0 },
    { turso_calls: 0, external_calls: true },
  ];
  for (const metrics of cases) {
    const got = classifyResponse({
      status: 200,
      headers: new Headers(),
      body: { metrics },
    });
    assert.equal(
      got.malformed_metrics,
      true,
      `body metrics ${JSON.stringify(metrics)}`,
    );
    assert.equal(got.external_calls == null || got.external_calls >= 0, true);
    assert.equal(
      evaluateStop({
        target: "fixture",
        started: 1,
        results: [{ status: 200, classification: got }],
      }).reason,
      "malformed_metrics",
    );
  }
});

test("external negative cannot bypass fixture/local stop (defense)", () => {
  // Even if a hostile classification slipped through with external_calls < 0,
  // evaluateStop must still halt as malformed_metrics (not treat as external=0).
  const decision = evaluateStop({
    target: "fixture",
    started: 10,
    results: [
      {
        status: 200,
        classification: {
          kind: "ok",
          turso_calls: 0,
          external_calls: -1,
          turso_error: false,
          malformed_metrics: false,
        },
      },
    ],
  });
  assert.equal(decision.stop, true);
  assert.equal(decision.reason, "malformed_metrics");
});

test("evaluateStop covers error rate, 429, timeout, turso, external, malformed, signal", () => {
  const base = (over) => ({
    status: 200,
    classification: {
      kind: "ok",
      turso_calls: 0,
      external_calls: 0,
      turso_error: false,
      malformed_metrics: false,
      ...over,
    },
  });

  assert.equal(
    evaluateStop({
      target: "fixture",
      started: 1,
      results: [base({ kind: "http_429" })],
    }).reason,
    "http_429",
  );
  assert.equal(
    evaluateStop({
      target: "fixture",
      started: 1,
      results: [base({ kind: "timeout" })],
    }).reason,
    "timeout",
  );
  assert.equal(
    evaluateStop({
      target: "fixture",
      started: 1,
      results: [base({ turso_error: true, kind: "http_error" })],
    }).reason,
    "turso_error",
  );
  assert.equal(
    evaluateStop({
      target: "fixture",
      started: 1,
      results: [base({ malformed_metrics: true })],
    }).reason,
    "malformed_metrics",
  );
  assert.equal(
    evaluateStop({
      target: "fixture",
      started: 1,
      results: [base({ external_calls: 2 })],
    }).reason,
    "external_gt_started",
  );
  assert.equal(
    evaluateStop({
      target: "fixture",
      started: 2,
      results: [base({ external_calls: 1 })],
    }).reason,
    "fixture_local_external_gt_0",
  );
  assert.equal(
    evaluateStop({
      target: "local",
      started: 2,
      results: [base({ external_calls: 1 })],
    }).reason,
    "fixture_local_external_gt_0",
  );
  // 2 errors / 100 = 2% > 1%
  const many = Array.from({ length: 100 }, (_, i) =>
    i < 2 ? base({ kind: "http_error", status: 500 }) : base({}),
  );
  assert.equal(
    evaluateStop({ target: "fixture", started: 100, results: many }).reason,
    "error_rate_gt_1pct",
  );
  assert.equal(
    evaluateStop({
      target: "fixture",
      started: 0,
      results: [],
      signalStopped: true,
    }).reason,
    "signal",
  );
});

test("summarizeResults never invents turso/external zeros when unobserved", () => {
  const summary = summarizeResults(
    [
      {
        status: 200,
        latency_ms: 12,
        classification: {
          kind: "ok",
          cache: "hit",
          freshness: "fresh",
          turso_calls: null,
          external_calls: null,
        },
      },
    ],
    { wallMs: 100, started: 1 },
  );
  assert.equal(summary.turso_calls, null);
  assert.equal(summary.external_calls, null);
  assert.equal(summary.latency_ms.p50, 12);
});

test("writeReportAtomic produces parseable JSON", () => {
  const reportPath = tempReportPath("atomic");
  writeReportAtomic(reportPath, { ok: true, n: 1 });
  const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.n, 1);
});

test("fixture server: loopback random port, fixed modes, no external by default", async () => {
  const fx = await startFixtureServer();
  assert.match(fx.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  try {
    for (const mode of Object.keys(FIXTURE_MODES)) {
      const res = await fetch(`${fx.baseUrl}/api/anime/seasonal?mode=${mode}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-atb-freshness"), FIXTURE_MODES[mode].freshness);
      assert.equal(res.headers.get("x-atb-cache"), FIXTURE_MODES[mode].cache);
      assert.equal(res.headers.get("x-atb-external-calls"), "0");
      const body = await res.json();
      assert.equal(body.metrics.external_calls, 0);
    }
  } finally {
    await fx.close();
  }
});

test("fixture injection: delay / 429 / 500 / amplification / malformed", async () => {
  const fx = await startFixtureServer();
  try {
    const t0 = performance.now();
    const delayed = await fetch(`${fx.baseUrl}/api/anime/seasonal?delay_ms=80`);
    assert.equal(delayed.status, 200);
    assert.ok(performance.now() - t0 >= 50);

    const r429 = await fetch(`${fx.baseUrl}/api/anime/seasonal?status=429`);
    assert.equal(r429.status, 429);

    const r500 = await fetch(`${fx.baseUrl}/api/anime/seasonal?status=500`);
    assert.equal(r500.status, 500);

    const amp = await fetch(`${fx.baseUrl}/api/anime/seasonal?amplify_external=3`);
    assert.equal(amp.headers.get("x-atb-external-calls"), "3");

    const bad = await fetch(`${fx.baseUrl}/api/anime/seasonal?malformed=1`);
    assert.equal(bad.headers.get("x-atb-turso-calls"), "not-a-number");
  } finally {
    await fx.close();
  }
});

test("fixture rejects non-GET methods", async () => {
  const fx = await startFixtureServer();
  try {
    const res = await fetch(`${fx.baseUrl}/api/anime/seasonal`, { method: "POST", body: "{}" });
    assert.equal(res.status, 405);
  } finally {
    await fx.close();
  }
});

test("performGet uses GET + redirect manual against fixture", async () => {
  const fx = await startFixtureServer();
  try {
    const url = new URL(`${fx.baseUrl}/api/anime/seasonal?mode=warm_hit_fresh`);
    const result = await performGet(url, { timeout_ms: 3000 });
    assert.equal(result.status, 200);
    assert.equal(result.classification.freshness, "fresh");
    assert.equal(result.classification.cache, "hit");
  } finally {
    await fx.close();
  }
});

async function runHarnessCase(overrides) {
  const report = tempReportPath("run");
  const result = await runHarness({
    target: "fixture",
    scenario: "fresh",
    concurrency: [1],
    requests: 5,
    timeout_ms: 3000,
    path: "/api/anime/seasonal",
    report,
    inject: {},
    base_url: null,
    ...overrides,
  });
  const disk = JSON.parse(fs.readFileSync(result.reportPath, "utf8"));
  return { result, disk };
}

test("harness concurrency steps 1/5/10/25 against fixture", async () => {
  for (const c of [1, 5, 10, 25]) {
    const { result, disk } = await runHarnessCase({
      scenario: "stale",
      concurrency: [c],
      requests: 5,
    });
    assert.equal(result.exitCode, 0, `concurrency ${c} should pass`);
    assert.equal(disk.stopped, false);
    assert.equal(disk.steps[0].concurrency, c);
    assert.equal(disk.overall.completed, 5);
    assert.equal(disk.overall.external_calls, 0);
  }
});

test("harness matrix order cold_miss_fresh→warm_hit_fresh→warm_stale→unavailable", async () => {
  const { result, disk } = await runHarnessCase({
    scenario: "matrix",
    concurrency: [1],
    requests: 2,
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    disk.steps.map((s) => s.mode),
    [...MATRIX_ORDER],
  );
});

test("stop case: 429 aborts further issuance and writes partial report exit 1", async () => {
  const { result, disk } = await runHarnessCase({
    scenario: "fresh",
    concurrency: [1, 5],
    requests: 8,
    inject: { status: 429 },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(disk.partial, true);
  assert.equal(disk.stopped, true);
  assert.equal(disk.stop_reason, "http_429");
  // Must not complete all planned steps once stopped
  const planned = 2 /*modes fresh*/ * 2 /*conc*/ * 8;
  assert.ok(disk.overall.completed < planned);
});

test("stop case: amplify external on fixture", async () => {
  const { result, disk } = await runHarnessCase({
    scenario: "stale",
    concurrency: [1],
    requests: 3,
    inject: { amplify_external: 1 },
  });
  assert.equal(result.exitCode, 1);
  assert.ok(
    disk.stop_reason === "fixture_local_external_gt_0" ||
      disk.stop_reason === "external_gt_started",
  );
});

test("stop case: malformed metrics", async () => {
  const { result, disk } = await runHarnessCase({
    scenario: "stale",
    concurrency: [1],
    requests: 2,
    inject: { malformed: true },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(disk.stop_reason, "malformed_metrics");
});

test("stop case: timeout", async () => {
  const { result, disk } = await runHarnessCase({
    scenario: "stale",
    concurrency: [1],
    requests: 2,
    timeout_ms: 100,
    inject: { delay_ms: 500 },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(disk.stop_reason, "timeout");
});

test("stop case: turso error", async () => {
  const { result, disk } = await runHarnessCase({
    scenario: "stale",
    concurrency: [1],
    requests: 2,
    inject: { turso_error: true },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(disk.stop_reason, "turso_error");
});

test("CLI: production base-url rejected before fetch (exit 2)", async () => {
  const report = tempReportPath("prod");
  const { code, stderr } = await runCli([
    "--target",
    "local",
    "--base-url",
    "https://anime-tier-board.vercel.app",
    "--scenario",
    "stale",
    "--concurrency",
    "1",
    "--requests",
    "1",
    "--report",
    report,
  ]);
  assert.equal(code, 2);
  assert.match(stderr, /SAFETY/);
  assert.equal(fs.existsSync(report), false);
});

test("CLI: fixture happy path JSON parseable", async () => {
  const report = tempReportPath("cli-ok");
  const { code, stdout } = await runCli([
    "--target",
    "fixture",
    "--scenario",
    "stale",
    "--concurrency",
    "1",
    "--requests",
    "3",
    "--timeout-ms",
    "3000",
    "--report",
    report,
  ]);
  assert.equal(code, 0);
  const line = JSON.parse(stdout.trim().split("\n").at(-1));
  assert.equal(line.ok, true);
  const disk = JSON.parse(fs.readFileSync(report, "utf8"));
  assert.equal(disk.task_id, "ATB-745-S1-HERMES-v1");
  assert.equal(disk.target, "fixture");
  assert.ok(typeof disk.overall.throughput_rps === "number");
  assert.ok(disk.overall.latency_ms.p95 != null);
});

test("CLI signal/cleanup: SIGTERM stops and closes fixture (partial)", async () => {
  const report = tempReportPath("sig");
  const child = spawn(
    process.execPath,
    [
      HARNESS_PATH,
      "--target",
      "fixture",
      "--scenario",
      "matrix",
      "--concurrency",
      "1,5,10,25",
      "--requests",
      "50",
      "--timeout-ms",
      "5000",
      "--delay-ms",
      "30",
      "--report",
      report,
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`fixture readiness timeout: ${stderr}`)), 5000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.event === "fixture_ready") {
            clearTimeout(timer);
            resolve(event);
            return;
          }
        } catch {
          // Ignore an incomplete final line until the next data event.
        }
      }
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`child exited before readiness: code=${code} signal=${signal} ${stderr}`));
    });
  });

  assert.match(ready.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  if (process.platform === "win32") child.send({ signal: "SIGTERM" });
  else assert.equal(child.kill("SIGTERM"), true);
  const closed = await Promise.race([
    new Promise((resolve) =>
      child.once("close", (code, signal) => resolve({ code, signal })),
    ),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`graceful SIGTERM timeout: ${stderr}`)), 5000),
    ),
  ]);

  assert.deepEqual(closed, { code: 1, signal: null });
  assert.equal(child.exitCode, 1);
  assert.equal(fs.existsSync(report), true, "partial report must be written");
  const disk = JSON.parse(fs.readFileSync(report, "utf8"));
  assert.equal(disk.partial, true);
  assert.equal(disk.stopped, true);
  assert.equal(disk.stop_reason, "signal");
  assert.equal(new URL(disk.base_url).port, String(ready.port));

  // Rebinding the exact fixture endpoint proves the child closed its owned
  // listener rather than merely exiting while leaving a socket/fixture alive.
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(ready.port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) =>
    probe.close((err) => (err ? reject(err) : resolve())),
  );
});

test("buildFixturePayload modes are stable", () => {
  const p = buildFixturePayload("cold_miss_fresh");
  assert.equal(p.headers["x-atb-cache"], "miss");
  assert.equal(p.body.freshness, "fresh");
});

test("harnessMain returns 2 on safety invalid", async () => {
  const code = await harnessMain([
    "--target",
    "local",
    "--base-url",
    "http://evil.example:80",
    "--requests",
    "1",
    "--concurrency",
    "1",
  ]);
  assert.equal(code, 2);
});

test("local target against tiny loopback stub (GET only path)", async () => {
  let sawNonGet = false;
  const server = http.createServer((req, res) => {
    if (req.method !== "GET") {
      sawNonGet = true;
      res.writeHead(405);
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "x-atb-cache": "hit",
      "x-atb-freshness": "fresh",
      "x-atb-turso-calls": "0",
      "x-atb-external-calls": "0",
    });
    res.end(
      JSON.stringify({
        ok: true,
        freshness: "fresh",
        cache: "hit",
        metrics: { turso_calls: 0, external_calls: 0 },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const report = tempReportPath("local");
  try {
    const result = await runHarness({
      target: "local",
      base_url: `http://127.0.0.1:${port}`,
      scenario: "stale",
      concurrency: [1, 5],
      requests: 4,
      timeout_ms: 3000,
      path: "/api/anime/seasonal",
      report,
      inject: {},
    });
    assert.equal(result.exitCode, 0);
    assert.equal(sawNonGet, false);
    const disk = JSON.parse(fs.readFileSync(report, "utf8"));
    assert.equal(disk.target, "local");
    assert.equal(disk.overall.external_calls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
