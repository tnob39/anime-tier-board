import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CAPACITY_TASK_ID,
  DEFAULT_CATALOG,
  READ_TASK_ID,
  WRITE_TASK_ID,
  STAGED_CONCURRENCY,
  evaluateCapacity,
  loadCatalog,
  runCapacityReport,
  parseCapacityArgs,
  sha256Hex,
  validateReadHarnessEvidence,
  validateWriteHarnessEvidence,
  isCleanExpectedRateLimitStep,
  isCleanNominalStep,
  main as capacityMain,
} from "../scripts/load/capacity-report.mjs";
import { runWriteHarness } from "../scripts/load/write-harness.mjs";
import {
  RATE_LIMIT_IDENTITY_MAX_LENGTH,
  createFixtureId,
  createRunId,
  createStageId,
  isValidRateLimitIdentity,
} from "../scripts/load/write-fixture-server.mjs";
import { SafetyError } from "../scripts/load/read-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, DEFAULT_CATALOG);
const EXAMPLE = path.join(ROOT, "docs", "release", "capacity-evidence.example.json");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atb745c-"));
}

function writeBound(dir, name, obj) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, JSON.stringify(obj));
  const bytes = fs.readFileSync(filePath);
  return { path: name, sha256: sha256Hex(bytes) };
}

function validOverall(over = {}) {
  return {
    started: 10,
    completed: 10,
    wall_ms: 1000,
    throughput_rps: 10,
    latency_ms: { p50: 10, p95: 20, p99: 30, min: 5, max: 30, samples: 10 },
    statuses: { 200: 10 },
    timeouts: 0,
    network_errors: 0,
    http_errors: 0,
    error_rate: 0,
    cache: { hit: 10 },
    freshness: { fresh: 10 },
    turso_calls: 0,
    external_calls: 0,
    ...over,
  };
}

function makeStep(concurrency, summary, extra = {}) {
    return {
      concurrency,
      rate_limit: extra.rate_limit ?? null,
      mode: extra.mode ?? "warm_hit_fresh",
      scenario: extra.scenario ?? "nominal",
      stop_reason: extra.stop_reason ?? null,
      expected_stop: extra.expected_stop ?? false,
      stage_id: extra.stage_id ?? null,
      rate_limit_trace: extra.rate_limit_trace ?? null,
      family: extra.family,
      summary,
    };
}

function makeRateLimitTrace({ fixtureId, runId, stageId, rateLimit = 2, total = 4 }) {
  return Array.from({ length: total }, (_, index) => {
    const status = index < rateLimit ? 201 : 429;
    return {
      fixture_id: fixtureId,
      run_id: runId,
      stage_id: stageId,
      sequence: index + 1,
      decision: status === 201 ? "accepted" : "rate_limited",
      status,
      rate_limit: rateLimit,
    };
  });
}

function validReadData() {
  const steps = STAGED_CONCURRENCY.map((concurrency) =>
    makeStep(concurrency, validOverall()),
  );
  return {
    task_id: READ_TASK_ID,
    target: "fixture",
    testOnly: true,
    scenario: "matrix",
    concurrency_steps: [...STAGED_CONCURRENCY],
    stopped: false,
    stop_reason: null,
    provenance: {
      generatedBy: "scripts/load/read-harness.mjs",
      task_id: READ_TASK_ID,
      taskId: READ_TASK_ID,
      target: "fixture",
      targetEnvironment: "fixture",
      testOnly: true,
    },
    overall: validOverall({
      started: 40,
      completed: 40,
      statuses: { 200: 40 },
      throughput_rps: 40,
      latency_ms: { p50: 10, p95: 20, p99: 30, min: 5, max: 30, samples: 40 },
    }),
    steps,
  };
}

function validWriteData() {
  const fixtureId = "atb-fixture-00000000-0000-4000-8000-000000000001";
  const runId = "atb-run-00000000-0000-4000-8000-000000000002";
  const nominal = validOverall({ statuses: { 201: 10 } });
  const limited = validOverall({
    started: 4,
    completed: 4,
    statuses: { 201: 2, 429: 2 },
    http_errors: 2,
    error_rate: 0.5,
    latency_ms: { p50: 10, p95: 20, p99: 30, min: 5, max: 30, samples: 4 },
  });
  const steps = [];
  for (const [stageIndex, concurrency] of STAGED_CONCURRENCY.entries()) {
    const stageId = `stage-${stageIndex + 1}`;
    steps.push(
      makeStep(concurrency, nominal, { family: "write", scenario: "nominal" }),
    );
    steps.push(
      makeStep(concurrency, limited, {
        family: "write",
        scenario: "rate-limit",
        rate_limit: 2,
        stop_reason: "http_429",
        expected_stop: true,
        stage_id: stageId,
        rate_limit_trace: makeRateLimitTrace({ fixtureId, runId, stageId }),
      }),
    );
  }
  return {
    task_id: WRITE_TASK_ID,
    family: "write",
    target: "fixture",
    fixture_id: fixtureId,
    run_id: runId,
    testOnly: true,
    scenario: "matrix",
    concurrency_steps: [...STAGED_CONCURRENCY],
    stopped: false,
    stop_reason: null,
    remaining_after_cleanup: 0,
    rate_limit_confirmed: true,
    idempotent_replays: 12,
    provenance: {
      generatedBy: "scripts/load/write-harness.mjs",
      task_id: WRITE_TASK_ID,
      taskId: WRITE_TASK_ID,
      target: "fixture",
      targetEnvironment: "fixture",
      testOnly: true,
    },
    overall: validOverall({
       started: 56,
       completed: 56,
       statuses: { 201: 48, 429: 8 },
       http_errors: 8,
       error_rate: 8 / 56,
       throughput_rps: 40,
       latency_ms: { p50: 10, p95: 20, p99: 30, min: 5, max: 30, samples: 56 },
    }),
    steps,
  };
}

function weakUrlEvidence(value) {
  return {
    status: "proven",
    value,
    evidence: [
      {
        source: "https://example.invalid/platform-limits",
        retrieved_at: "2026-09-21T00:00:00Z",
        artifact_ref: "artifact://platform/limits-audit-2026-09-21",
      },
    ],
  };
}

test("repository catalog fail-closes unproven Vercel/Turso/SNS limits", () => {
  const { catalog } = loadCatalog(CATALOG);
  assert.equal(catalog.task_id, CAPACITY_TASK_ID);
  const required = [
    "vercel_request_quota",
    "vercel_function_duration_ms",
    "vercel_concurrency_limit",
    "vercel_bandwidth_quota",
    "turso_request_quota",
    "turso_row_quota",
    "turso_storage_quota",
    "expected_sns_peak_concurrency",
    "expected_sns_burst_rps",
  ];
  assert.deepEqual(catalog.required_for_launch, required);
  for (const key of required) {
    assert.equal(catalog.limits[key].status, "unknown_blocking", key);
    assert.equal(catalog.limits[key].value, null, key);
  }
});

test("evaluateCapacity is NO_GO while required limits are unknown", () => {
  const { catalog } = loadCatalog(CATALOG);
  const result = evaluateCapacity({
    catalog,
    readReport: { present: true, data: validReadData() },
    writeReport: { present: true, data: validWriteData() },
  });
  assert.equal(result.decision, "NO_GO");
  assert.ok(result.reasons.includes("unknownPlatformLimits"));
  assert.ok(result.reasons.includes("unboundHarnessEvidence"));
});

test("unknown_blocking omitted from required_for_launch still NO_GO", () => {
  const { catalog } = loadCatalog(CATALOG);
  const filled = structuredClone(catalog);
  filled.required_for_launch = filled.required_for_launch.filter(
    (key) => key !== "vercel_bandwidth_quota",
  );
  const result = evaluateCapacity({ catalog: filled });
  assert.equal(result.decision, "NO_GO");
  assert.ok(result.reasons.includes("unknownPlatformLimits"));
  assert.ok(result.blocking_limits.some((b) => String(b.key).includes("vercel_bandwidth_quota")));
});

test("source URL evidence without SHA-256 binding is NO_GO", () => {
  const { catalog } = loadCatalog(CATALOG);
  const filled = structuredClone(catalog);
  for (const key of Object.keys(filled.limits)) filled.limits[key] = weakUrlEvidence(1);
  filled.slo_alert_rollback.latency_slo_ms = weakUrlEvidence(2000);
  filled.slo_alert_rollback.alert_destination = weakUrlEvidence("alert://test");
  const result = evaluateCapacity({
    catalog: filled,
    readReport: { present: true, data: validReadData() },
    writeReport: { present: true, data: validWriteData() },
  });
  assert.equal(result.decision, "NO_GO");
  assert.ok(result.reasons.includes("unboundProvenLimits"));
  assert.ok(result.reasons.includes("unboundHarnessEvidence"));
});

test("forged SHA-bound platform-limit JSON is validated but cannot become authoritative", () => {
  const { catalog } = loadCatalog(CATALOG);
  const dir = tempDir();
  const forged = structuredClone(catalog);
  for (const key of forged.required_for_launch) {
    forged.limits[key] = {
      status: "proven",
      value: 1,
      evidence: [writeBound(dir, `${key}.json`, {
        limit: key,
        value: 1,
        status: "proven",
        testOnly: false,
        provenance: { testOnly: false },
      })],
    };
  }
  const result = evaluateCapacity({
    catalog: forged,
    pathOpts: { workspaceRoot: ROOT, trustedOutputRoot: dir },
  });
  assert.equal(result.decision, "NO_GO");
  assert.ok(result.reasons.includes("unknownPlatformLimits"));
});

test("bare concurrency steps without per-stage metrics are invalid", () => {
  const read = validReadData();
  read.steps = STAGED_CONCURRENCY.map((concurrency) => ({ concurrency }));
  assert.equal(validateReadHarnessEvidence(read).ok, false);
  const write = validWriteData();
  write.steps = STAGED_CONCURRENCY.map((concurrency) => ({ concurrency }));
  assert.equal(validateWriteHarnessEvidence(write).ok, false);
});

test("per-stage blocking stop is invalid even if overall looks clean", () => {
  const read = validReadData();
  read.steps[2].stop_reason = "timeout";
  read.steps[2].summary.timeouts = 1;
  read.overall.timeouts = 1;
  assert.equal(validateReadHarnessEvidence(read).ok, false);
});

test("write parser accepts expected rate-limit stop and rejects unexpected stops", () => {
  const ok = validWriteData();
  assert.equal(validateWriteHarnessEvidence(ok).ok, true);
  const unexpected = validWriteData();
  unexpected.steps.find((s) => s.scenario === "rate-limit").expected_stop = false;
  assert.equal(validateWriteHarnessEvidence(unexpected).ok, false);
  const wrongReason = validWriteData();
  wrongReason.steps.find((s) => s.scenario === "rate-limit").stop_reason = "timeout";
  assert.equal(validateWriteHarnessEvidence(wrongReason).ok, false);
  const forged = validWriteData();
  delete forged.provenance;
  assert.equal(validateWriteHarnessEvidence(forged).ok, false);
});

test("rate-limit trace accepts server sequence and nominal rejects 429", () => {
  const rate = () => validWriteData().steps.find((s) => s.scenario === "rate-limit");
  const nominal = () => validWriteData().steps.find((s) => s.scenario === "nominal");
  assert.equal(isCleanExpectedRateLimitStep(rate()), true);
  assert.equal(isCleanNominalStep(nominal(), "write"), true);
  const timeout = rate(); timeout.summary.timeouts = 1;
  assert.equal(isCleanExpectedRateLimitStep(timeout), false);
  const five = rate(); five.summary.statuses = { 429: 1, 500: 1 }; five.summary.http_errors = 2;
  assert.equal(isCleanExpectedRateLimitStep(five), false);
  const mixed = rate(); mixed.summary.statuses = { 429: 1, 201: 1 }; mixed.summary.http_errors = 1;
  mixed.summary.started = 2;
  mixed.summary.completed = 2;
  mixed.rate_limit = 1;
  mixed.rate_limit_trace = mixed.rate_limit_trace.slice(0, 2).map((record, index) => ({
    ...record,
    sequence: index + 1,
    status: index === 0 ? 201 : 429,
    decision: index === 0 ? "accepted" : "rate_limited",
    rate_limit: 1,
  }));
  assert.equal(isCleanExpectedRateLimitStep(mixed), true);
  const all429 = rate();
  all429.summary.statuses = { 429: 4 };
  all429.summary.started = 4;
  all429.summary.completed = 4;
  all429.summary.http_errors = 4;
  all429.rate_limit_trace = all429.rate_limit_trace.map((record) => ({
    ...record,
    status: 429,
    decision: "rate_limited",
  }));
  assert.equal(isCleanExpectedRateLimitStep(all429), false);
  const wrongAcceptedCount = rate();
  wrongAcceptedCount.summary.statuses = { 201: 1, 429: 3 };
  wrongAcceptedCount.summary.started = 4;
  wrongAcceptedCount.summary.completed = 4;
  wrongAcceptedCount.summary.http_errors = 3;
  wrongAcceptedCount.rate_limit_trace[0].status = 429;
  wrongAcceptedCount.rate_limit_trace[0].decision = "rate_limited";
  assert.equal(isCleanExpectedRateLimitStep(wrongAcceptedCount), false);
  const acceptedAfter429 = rate();
  acceptedAfter429.summary.statuses = { 201: 3, 429: 1 };
  acceptedAfter429.summary.http_errors = 1;
  acceptedAfter429.rate_limit_trace[2].status = 201;
  acceptedAfter429.rate_limit_trace[2].decision = "accepted";
  assert.equal(isCleanExpectedRateLimitStep(acceptedAfter429), false);
  const missingTrace = rate();
  delete missingTrace.rate_limit_trace;
  assert.equal(isCleanExpectedRateLimitStep(missingTrace), false);
  const malformedTrace = rate();
  malformedTrace.rate_limit_trace[0].sequence = "1";
  assert.equal(isCleanExpectedRateLimitStep(malformedTrace), false);
  const duplicateSequence = rate();
  duplicateSequence.rate_limit_trace[1].sequence = 1;
  assert.equal(isCleanExpectedRateLimitStep(duplicateSequence), false);
  const gappedSequence = rate();
  gappedSequence.rate_limit_trace[1].sequence = 3;
  assert.equal(isCleanExpectedRateLimitStep(gappedSequence), false);
  const reorderedSequence = rate();
  reorderedSequence.rate_limit_trace = [
    reorderedSequence.rate_limit_trace[1],
    reorderedSequence.rate_limit_trace[0],
    ...reorderedSequence.rate_limit_trace.slice(2),
  ];
  assert.equal(isCleanExpectedRateLimitStep(reorderedSequence), false);
  const identityMismatch = rate();
  identityMismatch.rate_limit_trace[0].stage_id = "stage-other";
  assert.equal(isCleanExpectedRateLimitStep(identityMismatch), false);
  const aggregateMismatch = rate();
  aggregateMismatch.summary.statuses[201] = 3;
  assert.equal(isCleanExpectedRateLimitStep(aggregateMismatch), false);
  const extra = rate(); extra.summary.started = 9;
  assert.equal(isCleanExpectedRateLimitStep(extra), false);
  const turso = rate(); turso.summary.turso_calls = 1;
  assert.equal(isCleanExpectedRateLimitStep(turso), false);
  const ext = rate(); ext.summary.external_calls = 1;
  assert.equal(isCleanExpectedRateLimitStep(ext), false);
  const net = rate(); net.summary.network_errors = 1;
  assert.equal(isCleanExpectedRateLimitStep(net), false);
  const zero503 = rate(); zero503.summary.statuses = { 429: 2, 503: 0 };
  assert.equal(isCleanExpectedRateLimitStep(zero503), false);
  const hidden429 = nominal(); hidden429.summary.statuses = { 201: 9, 429: 1 };
  assert.equal(isCleanNominalStep(hidden429, "write"), false);
  const stopWithoutFlag = nominal(); stopWithoutFlag.stop_reason = "http_429";
  assert.equal(isCleanNominalStep(stopWithoutFlag, "write"), false);
  assert.equal(validateWriteHarnessEvidence(validWriteData()).ok, true);
});

test("rate-limit identities use strict typed grammar at every report boundary", () => {
  const generated = {
    fixture_id: createFixtureId(),
    run_id: createRunId(),
    stage_id: createStageId(1),
  };
  for (const [type, value] of Object.entries(generated)) {
    assert.equal(isValidRateLimitIdentity(type, value), true, `${type} generated identity`);
  }

  const invalids = [
    ["empty", ""],
    ["null", null],
    ["number", 1],
    ["whitespace", " "],
    ["leading whitespace", " value"],
    ["trailing whitespace", "value "],
    ["NUL", "value\u0000"],
    ["control", "value\u0001"],
    ["non-ASCII", "value\u00e9"],
    ["too long", "a".repeat(RATE_LIMIT_IDENTITY_MAX_LENGTH + 1)],
    ["forward slash", "value/path"],
    ["backslash", "value\\path"],
    ["dot traversal", "../value"],
    ["invalid punctuation", "value:value"],
  ];

  for (const [label, value] of invalids) {
    for (const type of Object.keys(generated)) {
      assert.equal(isValidRateLimitIdentity(type, value), false, `${type} ${label}`);

      const topLevel = validWriteData();
      if (type === "stage_id") {
        topLevel.steps.find((step) => step.scenario === "rate-limit").stage_id = value;
      } else {
        topLevel[type] = value;
      }
      assert.equal(validateWriteHarnessEvidence(topLevel).ok, false, `${type} top-level ${label}`);

      const traceRecord = validWriteData();
      const rateStep = traceRecord.steps.find((step) => step.scenario === "rate-limit");
      rateStep.rate_limit_trace[0][type] = value;
      assert.equal(validateWriteHarnessEvidence(traceRecord).ok, false, `${type} trace ${label}`);
    }
  }

  for (const [type, wrongType] of [["fixture_id", "run_id"], ["run_id", "stage_id"], ["stage_id", "fixture_id"]]) {
    const topLevel = validWriteData();
    if (type === "stage_id") {
      topLevel.steps.find((step) => step.scenario === "rate-limit").stage_id = generated[wrongType];
    } else {
      topLevel[type] = generated[wrongType];
    }
    assert.equal(validateWriteHarnessEvidence(topLevel).ok, false, `${type} wrong type`);

    const traceRecord = validWriteData();
    const rateStep = traceRecord.steps.find((step) => step.scenario === "rate-limit");
    rateStep.rate_limit_trace[0][type] = generated[wrongType];
    assert.equal(validateWriteHarnessEvidence(traceRecord).ok, false, `${type} trace wrong type`);
  }
});

test("actual fixture matrix output satisfies the write validator before capacity remains NO_GO", async () => {
  const dir = tempDir();
  const run = await runWriteHarness({
    target: "fixture",
    scenario: "matrix",
    concurrency: [...STAGED_CONCURRENCY],
    requests: 4,
    timeout_ms: 3000,
    report: "write-matrix.json",
    rate_limit: 100,
    inject: {},
    workspaceRoot: ROOT,
    trustedOutputRoot: dir,
  });
  assert.equal(run.exitCode, 0, run.report.stop_reason);
  const generatedMatrix = JSON.parse(fs.readFileSync(run.reportPath, "utf8"));
  assert.equal(validateWriteHarnessEvidence(generatedMatrix).ok, true);
  const rateSteps = generatedMatrix.steps.filter((step) => step.scenario === "rate-limit");
  assert.deepEqual(rateSteps.map((step) => step.concurrency), [...STAGED_CONCURRENCY]);
  assert.ok(rateSteps.every((step) => (
    step.summary.statuses[201] === step.rate_limit &&
    step.summary.statuses[200] === undefined &&
    step.summary.statuses[429] >= 1 &&
    step.rate_limit_trace.length === step.summary.started &&
    step.rate_limit_trace.filter((record) => record.status === 201).length === step.rate_limit &&
    step.rate_limit_trace.every((record, index) => record.sequence === index + 1)
  )));
  const reportSpec = {
    path: "write-matrix.json",
    sha256: sha256Hex(fs.readFileSync(run.reportPath)),
  };
  const { catalog } = loadCatalog(CATALOG);
  const result = evaluateCapacity({
    catalog,
    writeReport: reportSpec,
    pathOpts: { workspaceRoot: ROOT, trustedOutputRoot: dir },
  });
  assert.equal(result.decision, "NO_GO");
  assert.equal(result.coverage.write_harness, true);
  assert.equal(result.reasons.includes("invalidWriteHarnessEvidence"), false);
});

test("inconsistent aggregate vs stages is invalid", () => {
  const read = validReadData();
  read.overall.completed = 1;
  assert.equal(validateReadHarnessEvidence(read).ok, false);
});

test("example evidence is template NO_GO", () => {
  const example = JSON.parse(fs.readFileSync(EXAMPLE, "utf8"));
  assert.equal(example.template, true);
  assert.equal(example.decision, "NO_GO");
});

test("hash mismatch and wrong limit payload stay NO_GO", () => {
  const { catalog } = loadCatalog(CATALOG);
  const dir = tempDir();
  const pathOpts = { trustedOutputRoot: dir, workspaceRoot: ROOT };
  const filled = structuredClone(catalog);
  for (const key of Object.keys(filled.limits)) {
    const art = writeBound(dir, `${key}.json`, { limit: key, value: 1, status: "proven" });
    filled.limits[key] = {
      status: "proven",
      value: 1,
      evidence: [{ path: art.path, sha256: "0".repeat(64) }],
    };
  }
  filled.slo_alert_rollback.latency_slo_ms = {
    status: "proven",
    value: 2000,
    evidence: [writeBound(dir, "slo.json", { limit: "latency_slo_ms", value: 9, status: "proven" })],
  };
  filled.slo_alert_rollback.alert_destination = weakUrlEvidence("alert://x");
  const result = evaluateCapacity({
    catalog: filled,
    readReport: writeBound(dir, "read.json", validReadData()),
    writeReport: writeBound(dir, "write.json", validWriteData()),
    pathOpts,
  });
  assert.equal(result.decision, "NO_GO");
  assert.ok(result.reasons.includes("evidenceHashMismatch"));
  assert.ok(
    result.reasons.includes("evidenceDoesNotProveLimit") ||
      result.reasons.includes("unknownLatencySlo"),
  );
});

test("self-authored bound JSON remains NO_GO at release decision", () => {
  const { catalog } = loadCatalog(CATALOG);
  const dir = tempDir();
  const pathOpts = { trustedOutputRoot: dir, workspaceRoot: ROOT };
  const filled = structuredClone(catalog);
  for (const key of Object.keys(filled.limits)) {
    filled.limits[key] = {
      status: "proven",
      value: 1,
      evidence: [writeBound(dir, `${key}.json`, { limit: key, value: 1, status: "proven", testOnly: true })],
    };
  }
  filled.slo_alert_rollback.latency_slo_ms = {
    status: "proven",
    value: 2000,
    evidence: [writeBound(dir, "slo.json", { limit: "latency_slo_ms", value: 2000, status: "proven", testOnly: true })],
  };
  filled.slo_alert_rollback.alert_destination = {
    status: "proven",
    value: "alert://oncall",
    evidence: [
      writeBound(dir, "alert.json", {
        limit: "alert_destination",
        value: "alert://oncall",
        status: "proven",
        testOnly: true,
      }),
    ],
  };
  const result = evaluateCapacity({
    catalog: filled,
    readReport: writeBound(dir, "read.json", validReadData()),
    writeReport: writeBound(dir, "write.json", validWriteData()),
    pathOpts,
  });
  assert.equal(result.decision, "NO_GO");
  assert.ok(result.reasons.includes("testOnlyEvidence") || result.reasons.includes("nonProductionProvenance"));
  assert.equal(result.coverage.read_harness, true);
  assert.equal(result.coverage.write_harness, true);
});

test("runCapacityReport attaches hashed harness files and stays NO_GO on repo catalog", () => {
  const dir = tempDir();
  const readFile = writeBound(dir, "read.json", validReadData());
  const writeFile = writeBound(dir, "write.json", validWriteData());
  const { report, exitCode } = runCapacityReport({
    catalog: CATALOG,
    read_report: readFile.path,
    write_report: writeFile.path,
    smoke_report: null,
    out: "cap.json",
    trustedOutputRoot: dir,
  });
  assert.equal(exitCode, 1);
  assert.equal(report.coverage.read_harness, true);
  assert.equal(report.coverage.write_harness, true);
  assert.equal(report.decision, "NO_GO");
  assert.ok(report.reasons.includes("unknownPlatformLimits"));
});

test("CLI catalog evaluation writes machine-readable NO_GO under artifacts/load", () => {
  const rel = `capacity-cli-${process.pid}.json`;
  const code = capacityMain(["--catalog", CATALOG, "--out", rel]);
  assert.equal(code, 1);
  const diskPath = path.join(ROOT, "artifacts", "load", rel);
  const disk = JSON.parse(fs.readFileSync(diskPath, "utf8"));
  assert.equal(disk.task_id, CAPACITY_TASK_ID);
  assert.equal(disk.decision, "NO_GO");
  fs.unlinkSync(diskPath);
});

test("imported evaluateCapacity never GOs from truthy unsigned provenance paths", () => {
  const { catalog } = loadCatalog(CATALOG);
  const result = evaluateCapacity({
    catalog,
    pathOpts: {
      workspaceRoot: ROOT,
      signedManifest: path.join(ROOT, "docs", "release", "signing-policy.json"),
      detachedSignature: path.join(ROOT, "docs", "release", "capacity-evidence.example.json"),
    },
  });
  assert.equal(result.decision, "NO_GO");
  assert.ok(result.reasons.includes("missingSignedProvenance"));
  assert.ok(result.reasons.includes("missingProductionSigner"));
});

test("CLI rejects absolute Windows output traversal", () => {
  assert.throws(
    () => parseCapacityArgs(["--out", "C:\\Windows\\Temp\\atb-745.json"]),
    SafetyError,
  );
  const code = capacityMain(["--out", "C:\\Windows\\Temp\\atb-745.json"]);
  assert.equal(code, 2);
});
