#!/usr/bin/env node
/**
 * ATB-745-P0 — offline capacity gate report.
 * Fail-closed: unknown platform/SNS limits cannot become GO.
 * Proven claims and harness reports must be SHA-256 bound to readable artifacts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SafetyError } from "./safety-error.mjs";
import { writeReportAtomic } from "./read-harness.mjs";
import {
  DEFAULT_OUTPUT_DIR,
  WORKSPACE_ROOT,
  hasExactPathSpelling,
  posixRelativeFromRoot,
  resolveSafePath,
  stampTestOnlyReport,
} from "./safe-path.mjs";
import {
  productionVerifier,
  evaluateSignedManifest,
  resolveTrustedReleasePolicy,
  normalizeEvidenceEntry,
  canonicalizeEvidencePath,
  resolveExternalProductionTrustAnchor,
} from "./signed-provenance.mjs";
import {
  parseJsonBytesStrict,
  StrictJsonError,
  hasPrototypePollutionKey,
  isPlainOwnDataObject,
  ownDataValue,
} from "./strict-json.mjs";
import { isValidRateLimitIdentity } from "./write-fixture-server.mjs";

export const CAPACITY_TASK_ID = "ATB-745-P0-CAPACITY";
export const READ_TASK_ID = "ATB-745-S1-HERMES-v1";
export const WRITE_TASK_ID = "ATB-745-P0-WRITE";
export const STAGED_CONCURRENCY = Object.freeze([1, 5, 10, 25]);
export const DEFAULT_CATALOG = path.join(
  "docs",
  "release",
  "capacity-limits.catalog.json",
);
const SHA256_RE = /^[a-f0-9]{64}$/;
const plain = isPlainOwnDataObject;
const RATE_LIMIT_TRACE_KEYS = Object.freeze([
  "fixture_id",
  "run_id",
  "stage_id",
  "sequence",
  "decision",
  "status",
  "rate_limit",
]);

export { SafetyError };

export function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readBytes(filePath) {
  return fs.readFileSync(filePath);
}

function evidenceCompareRoot(pathOpts = {}, role = "evidence") {
  const trustedOutputRoot = ownDataValue(pathOpts, "trustedOutputRoot");
  if (trustedOutputRoot) return path.resolve(trustedOutputRoot);
  const ws = path.resolve(ownDataValue(pathOpts, "workspaceRoot") ?? WORKSPACE_ROOT);
  if (role === "catalog") return ws;
  if (role === "evidence") return path.join(ws, "artifacts", "evidence");
  return path.join(ws, "artifacts", "load");
}

export function isBoundEvidenceSpec(item) {
  if (!isPlainOwnDataObject(item)) return false;
  if (!canonicalizeEvidencePath(ownDataValue(item, "path")).ok) return false;
  if (!SHA256_RE.test(String(ownDataValue(item, "sha256") || "").toLowerCase())) return false;
  return true;
}

export function loadBoundJson(spec, pathOpts = {}, role = "evidence") {
  if (!isBoundEvidenceSpec(spec)) {
    return { ok: false, reason: "unboundEvidence" };
  }
  const canon = canonicalizeEvidencePath(ownDataValue(spec, "path"));
  let resolved;
  try {
    resolved = resolveSafePath(canon.path, { ...pathOpts, role });
    const rel = posixRelativeFromRoot(evidenceCompareRoot(pathOpts, role), resolved);
    if (rel !== canon.path) return { ok: false, reason: "unboundEvidence" };
    if (!fs.existsSync(resolved)) return { ok: false, reason: "missingEvidenceArtifact" };
    if (!hasExactPathSpelling(evidenceCompareRoot(pathOpts, role), resolved)) {
      return { ok: false, reason: "evidencePathCaseMismatch" };
    }
  } catch {
    return { ok: false, reason: "unboundEvidence" };
  }
  const bytes = readBytes(resolved);
  const digest = sha256Hex(bytes);
  if (digest !== String(ownDataValue(spec, "sha256")).toLowerCase()) {
    return { ok: false, reason: "evidenceHashMismatch" };
  }
  let data;
  try {
    data = parseJsonBytesStrict(bytes, role);
  } catch (err) {
    if (err instanceof StrictJsonError && err.code === "duplicateKey") {
      return { ok: false, reason: "duplicateJsonKey" };
    }
    return { ok: false, reason: "evidenceNotJson" };
  }
  if (hasPrototypePollutionKey(data)) {
    return { ok: false, reason: "prototypeKeyRejected" };
  }
  return { ok: true, data, resolved, sha256: digest };
}

export function limitArtifactProves(data, key, value) {
  if (!isPlainOwnDataObject(data)) return false;
  const limit = ownDataValue(data, "limit");
  const status = ownDataValue(data, "status");
  const artifactValue = ownDataValue(data, "value");
  if (limit !== key || status !== "proven") return false;
  if (typeof value === "number") return artifactValue === value && Number.isFinite(artifactValue);
  return artifactValue === value && artifactValue != null && artifactValue !== "";
}

function isUnknownBlockingStatus(status) {
  return typeof status === "string" && /blocking/i.test(status) && status !== "proven";
}

export function collectUnknownBlocking(catalog) {
  const found = [];
  function walk(node, prefix) {
    if (!plain(node)) return;
    const status = ownDataValue(node, "status");
    if (isUnknownBlockingStatus(status)) {
      found.push({
        key: prefix || "(root)",
        status,
        value: ownDataValue(node, "value") ?? null,
      });
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "status" || key === "value" || key === "evidence" || key === "note" || key === "unit") {
        continue;
      }
      if (plain(child)) {
        walk(child, prefix ? `${prefix}.${key}` : key);
      }
    }
  }
  walk(catalog, "");
  return found;
}

function isFiniteNonNeg(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function isIntNonNeg(n) {
  return Number.isInteger(n) && n >= 0;
}

function isIntNonNegOrNull(n) {
  return n === null || isIntNonNeg(n);
}

export function validateLatency(latency) {
  if (!plain(latency)) return false;
  for (const key of ["p50", "p95", "p99"]) {
    const v = ownDataValue(latency, key);
    if (!(v === null || isFiniteNonNeg(v))) return false;
  }
  const samples = ownDataValue(latency, "samples");
  if (!isIntNonNeg(samples)) return false;
  if (samples > 0) {
    if (["p50", "p95", "p99"].map((key) => ownDataValue(latency, key)).some((v) => !isFiniteNonNeg(v))) return false;
  }
  return true;
}

export function validateOverallMetrics(overall) {
  if (!plain(overall)) return false;
  if (!isFiniteNonNeg(ownDataValue(overall, "throughput_rps"))) return false;
  if (!validateLatency(ownDataValue(overall, "latency_ms"))) return false;
  if (!plain(ownDataValue(overall, "statuses"))) {
    return false;
  }
  if (!isIntNonNeg(ownDataValue(overall, "timeouts"))) return false;
  if (!isIntNonNegOrNull(ownDataValue(overall, "turso_calls"))) return false;
  if (!isIntNonNegOrNull(ownDataValue(overall, "external_calls"))) return false;
  if (!isFiniteNonNeg(ownDataValue(overall, "error_rate"))) return false;
  if (!isIntNonNeg(ownDataValue(overall, "completed"))) return false;
  if (!isIntNonNeg(ownDataValue(overall, "started"))) return false;
  if (!isIntNonNeg(ownDataValue(overall, "network_errors") ?? 0)) return false;
  if (!isIntNonNeg(ownDataValue(overall, "http_errors") ?? 0)) return false;
  return true;
}

function hasBlockingReadStatus(statuses) {
  return Object.keys(statuses || {}).some((key) => {
    if (key === "null") return true;
    const n = Number(key);
    return Number.isFinite(n) && n >= 400;
  });
}

function blockingStopReason(reason) {
  return reason != null && reason !== "";
}

function stepsForConcurrency(steps, concurrency) {
  return (steps || []).filter((s) => plain(s) && ownDataValue(s, "concurrency") === concurrency);
}

function statusCount(statuses, code) {
  if (!plain(statuses)) return 0;
  const n = ownDataValue(statuses, String(code)) ?? ownDataValue(statuses, code);
  return Number.isInteger(n) ? n : 0;
}

function statusCodes(statuses) {
  return Object.keys(statuses || {})
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));
}

function hasExactOwnKeys(value, keys) {
  if (!plain(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && expected.every((key, i) => actual[i] === key);
}

function nonEmptyText(value) {
  return typeof value === "string" && value.length > 0;
}

export function validateRateLimitTrace(data, step) {
  if (!plain(step) || (data != null && !plain(data))) return false;
  const trace = ownDataValue(step, "rate_limit_trace");
  const rateLimit = ownDataValue(step, "rate_limit");
  const stageId = ownDataValue(step, "stage_id");
  const dataFixtureId = ownDataValue(data, "fixture_id");
  const dataRunId = ownDataValue(data, "run_id");
  const fixtureId = dataFixtureId === undefined ? trace?.[0]?.fixture_id : dataFixtureId;
  const runId = dataRunId === undefined ? trace?.[0]?.run_id : dataRunId;
  if (
    !Array.isArray(trace) || trace.length === 0 ||
    !Number.isInteger(rateLimit) || rateLimit < 1 ||
    !isValidRateLimitIdentity("stage_id", stageId) ||
    !isValidRateLimitIdentity("fixture_id", fixtureId) ||
    !isValidRateLimitIdentity("run_id", runId)
  ) return false;

  const counts = { 201: 0, 429: 0 };
  for (const [index, record] of trace.entries()) {
    if (!hasExactOwnKeys(record, RATE_LIMIT_TRACE_KEYS)) return false;
    if (
      !isValidRateLimitIdentity("fixture_id", record.fixture_id) ||
      !isValidRateLimitIdentity("run_id", record.run_id) ||
      !isValidRateLimitIdentity("stage_id", record.stage_id)
    ) return false;
    if (
      record.fixture_id !== fixtureId ||
      record.run_id !== runId ||
      record.stage_id !== stageId ||
      record.sequence !== index + 1 ||
      record.rate_limit !== rateLimit ||
      !Number.isInteger(record.sequence) ||
      !Number.isInteger(record.status) ||
      !Number.isInteger(record.rate_limit) ||
      record.rate_limit < 1 ||
      ![201, 429].includes(record.status)
    ) return false;
    const expectedStatus = index < rateLimit ? 201 : 429;
    const expectedDecision = expectedStatus === 201 ? "accepted" : "rate_limited";
    if (record.status !== expectedStatus || record.decision !== expectedDecision) return false;
    counts[record.status] += 1;
  }

  const summary = ownDataValue(step, "summary");
  const statuses = ownDataValue(summary, "statuses");
  if (!plain(summary) || !plain(statuses)) return false;
  const statusKeys = Object.keys(statuses).sort();
  const traceStatusKeys = Object.keys(counts).filter((key) => counts[key] > 0).sort();
  if (statusKeys.length !== traceStatusKeys.length || statusKeys.some((key, i) => key !== traceStatusKeys[i])) return false;
  for (const key of traceStatusKeys) {
    if (!Number.isInteger(statuses[key]) || statuses[key] !== counts[key]) return false;
  }
  const n200 = statusCount(statuses, 200);
  const n201 = statusCount(statuses, 201);
  const n429 = statusCount(statuses, 429);
  return (
    n201 === rateLimit &&
    n200 === 0 &&
    n429 >= 1 &&
    trace.length === n201 + n429 &&
    ownDataValue(summary, "started") === trace.length &&
    ownDataValue(summary, "completed") === trace.length &&
    ownDataValue(summary, "http_errors") === n429
  );
}

export function isCleanExpectedRateLimitStep(step, data = null) {
  if (!plain(step)) return false;
  if (ownDataValue(step, "expected_stop") !== true) return false;
  if (ownDataValue(step, "stop_reason") !== "http_429") return false;
  if (ownDataValue(step, "scenario") !== "rate-limit") return false;
  const s = ownDataValue(step, "summary");
  if (!validateOverallMetrics(s)) return false;
  if (ownDataValue(s, "timeouts") !== 0) return false;
  if ((ownDataValue(s, "network_errors") ?? 0) !== 0) return false;
  if ((ownDataValue(s, "turso_calls") ?? 0) !== 0) return false;
  if ((ownDataValue(s, "external_calls") ?? 0) !== 0) return false;
  const rateLimit = ownDataValue(step, "rate_limit");
  if (!Number.isInteger(rateLimit) || rateLimit < 1) return false;
  const n429 = statusCount(ownDataValue(s, "statuses"), 429);
  const n200 = statusCount(ownDataValue(s, "statuses"), 200);
  const n201 = statusCount(ownDataValue(s, "statuses"), 201);
  if (n201 !== rateLimit || n200 !== 0 || n429 < 1) return false;
  if (ownDataValue(s, "started") !== n429 + n200 + n201 || ownDataValue(s, "completed") !== n429 + n200 + n201) return false;
  if (ownDataValue(s, "http_errors") !== n429) return false;
  for (const code of statusCodes(ownDataValue(s, "statuses"))) {
    if (code !== 429 && code !== 200 && code !== 201) return false;
  }
  return validateRateLimitTrace(data, step);
}

export function isCleanNominalStep(step, family) {
  if (!plain(step)) return false;
  if (ownDataValue(step, "expected_stop") === true || ownDataValue(step, "scenario") === "rate-limit") return false;
  if (blockingStopReason(ownDataValue(step, "stop_reason"))) return false;
  const s = ownDataValue(step, "summary");
  if (!validateOverallMetrics(s)) return false;
  if (ownDataValue(s, "timeouts") !== 0) return false;
  if ((ownDataValue(s, "network_errors") ?? 0) !== 0) return false;
  if (statusCount(ownDataValue(s, "statuses"), 429) > 0) return false;
  for (const code of statusCodes(ownDataValue(s, "statuses"))) {
    if (code >= 500) return false;
    if (family === "read" && code >= 400) return false;
    if (family === "write" && code !== 200 && code !== 201) return false;
  }
  if (family !== "write" && hasBlockingReadStatus(ownDataValue(s, "statuses"))) return false;
  return true;
}

function isExpectedRateLimitStop(step, data) {
  return isCleanExpectedRateLimitStep(step, data);
}

function isNominalCapacityStep(step, family = "write") {
  return isCleanNominalStep(step, family);
}

function validateStage(step, { family, data }) {
  if (family === "write" && (ownDataValue(step, "scenario") === "rate-limit" || ownDataValue(step, "expected_stop") === true)) {
    return isCleanExpectedRateLimitStep(step, data);
  }
  return isCleanNominalStep(step, family);
}

function mergeStatuses(maps) {
  const out = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map || {})) {
      if (!Number.isInteger(value)) return null;
      out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
}

function nullableSum(values) {
  let sawNull = false;
  let sawNum = false;
  let total = 0;
  for (const v of values) {
    if (v == null) sawNull = true;
    else {
      sawNum = true;
      total += v;
    }
  }
  if (sawNull && sawNum) return { ok: false };
  if (sawNull) return { ok: true, value: null };
  return { ok: true, value: total };
}

export function crossCheckAggregates(overall, steps) {
  if (!validateOverallMetrics(overall) || !Array.isArray(steps) || steps.length === 0 || steps.some((step) => !plain(step))) {
    return false;
  }
  const summaries = steps.map((s) => ownDataValue(s, "summary"));
  if (summaries.some((s) => !validateOverallMetrics(s))) return false;
  const sum = (key) => summaries.reduce((acc, s) => acc + (ownDataValue(s, key) ?? 0), 0);
  if (ownDataValue(overall, "completed") !== sum("completed")) return false;
  if (ownDataValue(overall, "started") !== sum("started")) return false;
  if (ownDataValue(overall, "timeouts") !== sum("timeouts")) return false;
  if ((ownDataValue(overall, "network_errors") ?? 0) !== sum("network_errors")) return false;
  if ((ownDataValue(overall, "http_errors") ?? 0) !== sum("http_errors")) return false;
  const turso = nullableSum(summaries.map((s) => ownDataValue(s, "turso_calls")));
  const external = nullableSum(summaries.map((s) => ownDataValue(s, "external_calls")));
  if (!turso.ok || ownDataValue(overall, "turso_calls") !== turso.value) return false;
  if (!external.ok || ownDataValue(overall, "external_calls") !== external.value) return false;
  const merged = mergeStatuses(summaries.map((s) => ownDataValue(s, "statuses")));
  if (!merged) return false;
  const overallStatuses = ownDataValue(overall, "statuses");
  const overallKeys = Object.keys(overallStatuses);
  const mergedKeys = Object.keys(merged);
  if (overallKeys.length !== mergedKeys.length) return false;
  for (const key of mergedKeys) {
    if (ownDataValue(overallStatuses, key) !== merged[key]) return false;
  }
  return true;
}

function validateStagedSteps(data, { family }) {
  if (!plain(data)) return false;
  const declared = ownDataValue(data, "concurrency_steps");
  if (!Array.isArray(declared) || declared.length !== STAGED_CONCURRENCY.length) return false;
  if (!STAGED_CONCURRENCY.every((v, i) => declared[i] === v)) return false;
  const steps = ownDataValue(data, "steps");
  if (!Array.isArray(steps) || steps.length === 0) return false;
  for (const concurrency of STAGED_CONCURRENCY) {
    const group = stepsForConcurrency(steps, concurrency);
    if (group.length === 0) return false;
     if (!group.every((step) => validateStage(step, { family, data }))) return false;
    const nominal = group.filter((s) => isNominalCapacityStep(s, family));
    if (nominal.length === 0) return false;
    if (family === "write") {
      const rate = group.filter((s) => ownDataValue(s, "scenario") === "rate-limit" || ownDataValue(s, "expected_stop") === true);
      if (rate.length === 0 || !rate.every((step) => isCleanExpectedRateLimitStep(step, data))) return false;
    }
  }
  return crossCheckAggregates(ownDataValue(data, "overall"), steps);
}

function hasHarnessProvenance(data, script, taskId) {
  if (!plain(data)) return false;
  const p = ownDataValue(data, "provenance");
  if (!plain(p)) return false;
  return (
    ownDataValue(data, "testOnly") === true &&
    ownDataValue(p, "generatedBy") === script &&
    ownDataValue(p, "task_id") === taskId &&
    ownDataValue(p, "taskId") === taskId &&
    ownDataValue(p, "target") === ownDataValue(data, "target") &&
    ownDataValue(p, "targetEnvironment") === ownDataValue(data, "target") &&
    ownDataValue(p, "testOnly") === true
  );
}

export function validateReadHarnessEvidence(data) {
  if (!plain(data)) return { ok: false, reason: "missingReadHarnessReport" };
  if (ownDataValue(data, "task_id") !== READ_TASK_ID) return { ok: false, reason: "invalidReadHarnessEvidence" };
  if (!hasHarnessProvenance(data, "scripts/load/read-harness.mjs", READ_TASK_ID)) {
    return { ok: false, reason: "invalidReadHarnessEvidence" };
  }
  if (!validateOverallMetrics(ownDataValue(data, "overall"))) return { ok: false, reason: "invalidReadHarnessEvidence" };
  if (ownDataValue(data, "testOnly") !== true || ownDataValue(data, "stopped") !== false || ownDataValue(data, "stop_reason") != null) {
    return { ok: false, reason: "invalidReadHarnessEvidence" };
  }
  if (ownDataValue(ownDataValue(data, "overall"), "error_rate") !== 0 || ownDataValue(ownDataValue(data, "overall"), "timeouts") !== 0) {
    return { ok: false, reason: "invalidReadHarnessEvidence" };
  }
  if (hasBlockingReadStatus(ownDataValue(ownDataValue(data, "overall"), "statuses"))) {
    return { ok: false, reason: "invalidReadHarnessEvidence" };
  }
  if (!validateStagedSteps(data, { family: "read" })) {
    return { ok: false, reason: "invalidReadHarnessEvidence" };
  }
  return { ok: true, reason: null };
}

export function validateWriteHarnessEvidence(data) {
  if (!plain(data)) return { ok: false, reason: "missingWriteHarnessReport" };
  if (ownDataValue(data, "task_id") !== WRITE_TASK_ID) return { ok: false, reason: "invalidWriteHarnessEvidence" };
  if (ownDataValue(data, "family") !== "write") return { ok: false, reason: "invalidWriteHarnessEvidence" };
  if (!hasHarnessProvenance(data, "scripts/load/write-harness.mjs", WRITE_TASK_ID)) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  if (!validateOverallMetrics(ownDataValue(data, "overall"))) return { ok: false, reason: "invalidWriteHarnessEvidence" };
  if (ownDataValue(data, "testOnly") !== true || ownDataValue(data, "stopped") !== false || ownDataValue(data, "stop_reason") != null) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  if (ownDataValue(data, "remaining_after_cleanup") !== 0) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  if (ownDataValue(data, "rate_limit_confirmed") !== true) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  if (!nonEmptyText(ownDataValue(data, "fixture_id")) || !nonEmptyText(ownDataValue(data, "run_id"))) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  if (!Number.isInteger(ownDataValue(data, "idempotent_replays")) || ownDataValue(data, "idempotent_replays") < 1) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  if (ownDataValue(ownDataValue(data, "overall"), "timeouts") !== 0) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  if (!validateStagedSteps(data, { family: "write" })) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  const rateSteps = (ownDataValue(data, "steps") || []).filter((s) => ownDataValue(s, "scenario") === "rate-limit");
  const stageIds = rateSteps.map((step) => ownDataValue(step, "stage_id"));
  if (
    rateSteps.length === 0 ||
    new Set(stageIds).size !== stageIds.length ||
    !rateSteps.every((step) => isExpectedRateLimitStop(step, data))
  ) {
    return { ok: false, reason: "invalidWriteHarnessEvidence" };
  }
  return { ok: true, reason: null };
}

function bindHarness(report, pathOpts, role) {
  if (!report) return { present: false, bound: false, data: null, reason: null };
  if (isBoundEvidenceSpec(report)) {
    const loaded = loadBoundJson(report, pathOpts, role);
    if (!loaded.ok) return { present: true, bound: false, data: null, reason: loaded.reason };
    return { present: true, bound: true, data: loaded.data, reason: null };
  }
  if (!plain(report)) return { present: true, bound: false, data: null, reason: "invalidHarnessEvidence" };
  if (ownDataValue(report, "present") === false || ownDataValue(report, "data") == null) {
    return { present: false, bound: false, data: null, reason: null };
  }
  return { present: true, bound: false, data: ownDataValue(report, "data"), reason: "unboundHarnessEvidence" };
}

export function isProvenLimitBound(row, key, pathOpts) {
  if (!plain(row) || ownDataValue(row, "status") !== "proven") return { ok: false, reason: "unknownPlatformLimits" };
  const value = ownDataValue(row, "value");
  const evidence = ownDataValue(row, "evidence");
  if (value == null || value === "") return { ok: false, reason: "unknownPlatformLimits" };
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { ok: false, reason: "unknownPlatformLimits" };
  }
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return { ok: false, reason: "unboundProvenLimits" };
  }
  for (const item of evidence) {
    if (!isBoundEvidenceSpec(item)) return { ok: false, reason: "unboundProvenLimits" };
    const loaded = loadBoundJson(item, pathOpts, "evidence");
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    if (!limitArtifactProves(loaded.data, key, value)) {
      return { ok: false, reason: "evidenceDoesNotProveLimit" };
    }
    const provenance = ownDataValue(loaded.data, "provenance");
    if (ownDataValue(loaded.data, "testOnly") !== false || ownDataValue(provenance, "testOnly") !== false) {
      return { ok: false, reason: "testOnlyEvidence" };
    }
  }
  // SHA-bound JSON authored alongside the release is not an authoritative
  // Vercel/Turso/SNS attestation. No verifier is supplied in this scope.
  return { ok: false, reason: "unknownPlatformLimits" };
}

export function loadCatalog(catalogPath, options = {}) {
  const resolved = resolveSafePath(catalogPath, {
    ...options,
    workspaceRoot: ownDataValue(options, "workspaceRoot") ?? WORKSPACE_ROOT,
    trustedOutputRoot: ownDataValue(options, "trustedOutputRoot"),
    role: "catalog",
  });
  let catalog;
  try {
    catalog = parseJsonBytesStrict(fs.readFileSync(resolved), "catalog");
  } catch (err) {
    if (err instanceof StrictJsonError && err.code === "duplicateKey") {
      throw new SafetyError("capacity catalog duplicate object keys");
    }
    throw new SafetyError("capacity catalog is not valid JSON");
  }
  if (!plain(catalog)) {
    throw new SafetyError("capacity catalog must be a plain data object");
  }
  if (hasPrototypePollutionKey(catalog)) {
    throw new SafetyError("capacity catalog prototype keys are not allowed");
  }
  if (ownDataValue(catalog, "task_id") !== CAPACITY_TASK_ID) {
    throw new SafetyError("capacity catalog task_id mismatch");
  }
  if (!Array.isArray(ownDataValue(catalog, "required_for_launch")) || ownDataValue(catalog, "required_for_launch").length === 0) {
    throw new SafetyError("capacity catalog required_for_launch is empty");
  }
  return { catalog, resolved };
}

export function optionalReport(filePath, options = {}) {
  if (!filePath) return { present: false, path: null, sha256: null, data: null };
  const resolved = resolveSafePath(filePath, {
    ...options,
    workspaceRoot: ownDataValue(options, "workspaceRoot") ?? WORKSPACE_ROOT,
    trustedOutputRoot: ownDataValue(options, "trustedOutputRoot"),
    role: "input-report",
  });
  if (!fs.existsSync(resolved)) return { present: false, path: resolved, sha256: null, data: null };
  const bytes = readBytes(resolved);
  const digest = sha256Hex(bytes);
  let data;
  try {
    data = parseJsonBytesStrict(bytes, "input-report");
  } catch (err) {
    if (err instanceof StrictJsonError && err.code === "duplicateKey") {
      throw new SafetyError("input report duplicate object keys");
    }
    throw new SafetyError("input report is not valid JSON");
  }
  return {
    present: true,
    path: resolved,
    sha256: digest,
    data,
  };
}

function collectCapacityRequiredEvidence({ catalog, readReport, writeReport, smokeReport, pathOpts }) {
  const required = [];
  const push = (spec, semanticType) => {
    if (!isBoundEvidenceSpec(spec)) return;
    required.push(normalizeEvidenceEntry({ path: ownDataValue(spec, "path"), sha256: ownDataValue(spec, "sha256"), semanticType }));
  };
  if (isBoundEvidenceSpec(pathOpts.catalogSpec)) push(pathOpts.catalogSpec, "catalog");
  push(isBoundEvidenceSpec(readReport) ? readReport : null, "read-harness");
  push(isBoundEvidenceSpec(writeReport) ? writeReport : null, "write-harness");
  if (isBoundEvidenceSpec(smokeReport)) push(smokeReport, "production-smoke");
  const limits = plain(catalog) ? ownDataValue(catalog, "limits") : null;
  for (const [key, row] of Object.entries(plain(limits) ? limits : {})) {
    const evidence = plain(row) ? ownDataValue(row, "evidence") : null;
    if (!Array.isArray(evidence)) continue;
    for (const item of evidence) {
      if (isBoundEvidenceSpec(item)) push(item, "proven-limit");
    }
    void key;
  }
  const slo = plain(catalog) ? ownDataValue(catalog, "slo_alert_rollback") : null;
  for (const row of Object.values(plain(slo) ? slo : {})) {
    if (!plain(row)) continue;
    const evidence = ownDataValue(row, "evidence");
    if (!Array.isArray(evidence)) continue;
    for (const item of evidence) {
      if (isBoundEvidenceSpec(item)) push(item, "proven-limit");
    }
  }
  return required;
}

export function evaluateCapacity({
  catalog,
  readReport,
  writeReport,
  smokeReport,
  pathOpts = {},
} = {}) {
  const reasons = [];
  const blocking = collectUnknownBlocking(catalog);
  if (blocking.length) reasons.push("unknownPlatformLimits");

  const catalogData = plain(catalog) ? catalog : null;
  const limits = plain(ownDataValue(catalogData, "limits")) ? ownDataValue(catalogData, "limits") : null;
  const slo = plain(ownDataValue(catalogData, "slo_alert_rollback")) ? ownDataValue(catalogData, "slo_alert_rollback") : null;
  const required = Array.isArray(ownDataValue(catalogData, "required_for_launch")) ? ownDataValue(catalogData, "required_for_launch") : [];
  for (const key of required) {
    const row = ownDataValue(limits, key);
    const proven = isProvenLimitBound(row, key, pathOpts);
    if (!proven.ok) {
      if (!blocking.some((b) => String(b.key).includes(key))) {
        blocking.push({
          key,
          status: ownDataValue(row, "status") ?? "unknown_blocking",
          value: ownDataValue(row, "value") ?? null,
        });
      }
      reasons.push(proven.reason);
    }
  }

  for (const row of Object.values(limits ?? {})) {
    if (ownDataValue(row, "status") === "unknown_blocking" && ownDataValue(row, "value") != null) {
      reasons.push("inventedUnknownLimits");
      break;
    }
  }

  const latencySlo = isProvenLimitBound(
    ownDataValue(slo, "latency_slo_ms"),
    "latency_slo_ms",
    pathOpts,
  );
  if (!latencySlo.ok) reasons.push("unknownLatencySlo");
  const alertDest = isProvenLimitBound(
    ownDataValue(slo, "alert_destination"),
    "alert_destination",
    pathOpts,
  );
  if (!alertDest.ok) reasons.push("unknownAlertDestination");

  if (ownDataValue(catalogData, "template") === true) reasons.push("templateEvidence");

  const boundRead = bindHarness(readReport, pathOpts, "input-report");
  const boundWrite = bindHarness(writeReport, pathOpts, "input-report");
  const readCheck = boundRead.bound
    ? validateReadHarnessEvidence(boundRead.data)
    : {
        ok: false,
        reason: boundRead.present ? boundRead.reason || "unboundHarnessEvidence" : "missingReadHarnessReport",
      };
  const writeCheck = boundWrite.bound
    ? validateWriteHarnessEvidence(boundWrite.data)
    : {
        ok: false,
        reason: boundWrite.present
          ? boundWrite.reason || "unboundHarnessEvidence"
          : "missingWriteHarnessReport",
      };

  const coverage = {
    read_harness: readCheck.ok,
    write_harness: writeCheck.ok,
    production_smoke_report: Boolean(smokeReport && (ownDataValue(smokeReport, "path") || ownDataValue(smokeReport, "data"))),
    production_smoke_executed: Boolean(ownDataValue(ownDataValue(smokeReport, "data"), "executed") || ownDataValue(smokeReport, "executed")),
    production_smoke_enabled_by_default: false,
  };
  reasons.push(readCheck.ok ? null : readCheck.reason);
  reasons.push(writeCheck.ok ? null : writeCheck.reason);

  const smokeData = ownDataValue(smokeReport, "data");
  if (ownDataValue(smokeData, "executed") === true && ownDataValue(ownDataValue(smokeData, "plan"), "concurrency") !== 1) {
    reasons.push("productionSmokeConcurrencyUnsafe");
  }

  const signer = productionVerifier(
    ownDataValue(pathOpts, "workspaceRoot") ?? WORKSPACE_ROOT,
    ownDataValue(pathOpts, "productionTrustAnchor"),
  );
  if (!signer.ok) reasons.push(signer.reason);
  const trusted = resolveTrustedReleasePolicy({
    expectedCommit: ownDataValue(pathOpts, "trustedExpectedCommit") ?? ownDataValue(pathOpts, "expectedCommit"),
    expectedEnvironment: ownDataValue(pathOpts, "trustedExpectedEnvironment") ?? ownDataValue(pathOpts, "expectedEnvironment"),
    generatedAtMaxAgeMs: ownDataValue(pathOpts, "generatedAtMaxAgeMs"),
    generatedAtMaxAgeSeconds: ownDataValue(pathOpts, "generatedAtMaxAgeSeconds"),
    now: ownDataValue(pathOpts, "now"),
    workspaceRoot: ownDataValue(pathOpts, "workspaceRoot") ?? WORKSPACE_ROOT,
    allowEnvHead: false,
  });
  if (!trusted.expectedCommit) reasons.push("missingTrustedCommit");
  if (typeof trusted.generatedAtMaxAgeMs !== "number" || !Number.isFinite(trusted.generatedAtMaxAgeMs) || trusted.generatedAtMaxAgeMs <= 0) {
    reasons.push("missingFreshnessPolicy");
  }
  const requireProductionGo = (data) => {
    if (!data) return;
    const dataProvenance = ownDataValue(data, "provenance");
    if (ownDataValue(data, "testOnly") !== false || ownDataValue(dataProvenance, "testOnly") !== false) {
      reasons.push("testOnlyEvidence");
    }
    const provenance = dataProvenance;
    const target = ownDataValue(data, "target") ?? ownDataValue(provenance, "targetEnvironment");
    if (target !== "production") reasons.push("nonProductionProvenance");
    const taskId = String(ownDataValue(data, "task_id") || ownDataValue(data, "taskId") || ownDataValue(provenance, "taskId") || ownDataValue(provenance, "task_id") || "").trim();
    if (!taskId) reasons.push("missingTaskId");
    if (ownDataValue(provenance, "taskId") !== taskId || ownDataValue(provenance, "task_id") !== taskId) {
      reasons.push("invalidTaskProvenance");
    }
    const commit = ownDataValue(data, "commit") ?? ownDataValue(provenance, "commit");
    if (trusted.expectedCommit && commit !== trusted.expectedCommit) {
      reasons.push("staleOrWrongCommit");
    }
  };
  if (readCheck.ok) requireProductionGo(boundRead.data);
  if (writeCheck.ok) requireProductionGo(boundWrite.data);
  if (smokeData) requireProductionGo(smokeData);
  const manSpec = ownDataValue(pathOpts, "signedManifest");
  const sigSpec = ownDataValue(pathOpts, "detachedSignature");
  if (!isBoundEvidenceSpec(manSpec) || !isBoundEvidenceSpec(sigSpec)) {
    reasons.push("missingSignedProvenance");
  } else if (signer.ok) {
    const requiredEvidence = collectCapacityRequiredEvidence({
      catalog: catalogData,
      readReport,
      writeReport,
      smokeReport,
      pathOpts,
    });
    const signed = evaluateSignedManifest({
      manifestSpec: manSpec,
      signatureSpec: sigSpec,
      pathOpts,
      expectedCommit: trusted.expectedCommit,
      expectedEnvironment: trusted.expectedEnvironment || "production",
      publicKeyPem: signer.publicKeyPem,
      expectedKeyId: signer.keyId,
      now: trusted.now,
      generatedAtMaxAgeMs: trusted.generatedAtMaxAgeMs,
      requiredEvidence,
    });
    if (!signed.ok) reasons.push(signed.reason);
    else {
      if (ownDataValue(signed.manifest, "capacityDecision") !== "GO") reasons.push("capacityDecisionNotGo");
      if (!String(ownDataValue(signed.manifest, "taskId") || "").trim()) reasons.push("missingTaskId");
    }
  }

  const uniqueReasons = [...new Set(reasons.filter(Boolean))];
  const decision = uniqueReasons.length ? "NO_GO" : "GO";
  return {
    task_id: CAPACITY_TASK_ID,
    decision,
    reasons: uniqueReasons,
    blocking_limits: blocking,
    coverage,
    read_summary: readCheck.ok ? ownDataValue(boundRead.data, "overall") : null,
    write_summary: writeCheck.ok ? ownDataValue(boundWrite.data, "overall") : null,
    smoke_summary: ownDataValue(ownDataValue(smokeReport, "data"), "overall") ?? null,
    proven: ownDataValue(catalogData, "proven") ?? {},
    slo_alert_rollback: ownDataValue(catalogData, "slo_alert_rollback") ?? {},
  };
}

export function parseCapacityArgs(argv = process.argv.slice(2)) {
  const out = {
    catalog: path.join(WORKSPACE_ROOT, DEFAULT_CATALOG),
    read_report: null,
    write_report: null,
    smoke_report: null,
    out: path.join("artifacts", "load", "capacity-report.json"),
    signed_manifest: null,
    detached_signature: null,
    expected_commit: null,
    expected_environment: null,
    generated_at_max_age_seconds: null,
    production_key_id: null,
    production_public_key_pem: null,
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
      case "--catalog":
        out.catalog = next();
        break;
      case "--read-report":
        out.read_report = next();
        break;
      case "--write-report":
        out.write_report = next();
        break;
      case "--smoke-report":
        out.smoke_report = next();
        break;
      case "--out":
      case "--report":
        out.out = next();
        break;
      case "--signed-manifest":
        out.signed_manifest = next();
        break;
      case "--detached-signature":
        out.detached_signature = next();
        break;
      case "--expected-commit":
        out.expected_commit = next();
        break;
      case "--expected-environment":
        out.expected_environment = next();
        break;
      case "--generated-at-max-age-seconds":
        out.generated_at_max_age_seconds = Number(next());
        break;
      case "--production-key-id":
        out.production_key_id = next();
        break;
      case "--production-public-key-pem":
        out.production_public_key_pem = next();
        break;
      default:
        throw new SafetyError(`unknown argument: ${a}`);
    }
  }
  if (!out.help) {
    resolveSafePath(out.catalog, { workspaceRoot: WORKSPACE_ROOT, role: "catalog" });
    resolveSafePath(out.out, { workspaceRoot: WORKSPACE_ROOT, role: "output" });
    if (out.read_report) {
      resolveSafePath(out.read_report, { workspaceRoot: WORKSPACE_ROOT, role: "input-report" });
    }
    if (out.write_report) {
      resolveSafePath(out.write_report, { workspaceRoot: WORKSPACE_ROOT, role: "input-report" });
    }
    if (out.smoke_report) {
      resolveSafePath(out.smoke_report, { workspaceRoot: WORKSPACE_ROOT, role: "input-report" });
    }
    if (out.signed_manifest) {
      resolveSafePath(out.signed_manifest, { workspaceRoot: WORKSPACE_ROOT, role: "evidence" });
    }
    if (out.detached_signature) {
      resolveSafePath(out.detached_signature, { workspaceRoot: WORKSPACE_ROOT, role: "evidence" });
    }
  }
  return out;
}

function fileToBoundSpec(filePath, pathOpts, role) {
  if (!filePath) return null;
  const resolved = resolveSafePath(filePath, { ...pathOpts, role });
  if (!fs.existsSync(resolved)) return null;
  const bytes = readBytes(resolved);
  return { path: resolved, sha256: sha256Hex(bytes) };
}

export function runCapacityReport(opts) {
  const pathOpts = {
    workspaceRoot: opts.workspaceRoot ?? WORKSPACE_ROOT,
    trustedOutputRoot: opts.trustedOutputRoot,
    productionTrustAnchor: opts.productionTrustAnchor,
  };
  const { catalog, resolved: catalogResolved } = loadCatalog(opts.catalog, pathOpts);
  const catalogBytes = readBytes(catalogResolved);
  const catalogRel = posixRelativeFromRoot(pathOpts.workspaceRoot ?? WORKSPACE_ROOT, catalogResolved);
  pathOpts.catalogSpec = catalogRel && canonicalizeEvidencePath(catalogRel).ok
    ? { path: catalogRel, sha256: sha256Hex(catalogBytes) }
    : null;
  const trusted = resolveTrustedReleasePolicy({
    expectedCommit: opts.expected_commit ?? opts.trustedExpectedCommit,
    expectedEnvironment: opts.expected_environment ?? opts.trustedExpectedEnvironment,
    generatedAtMaxAgeSeconds: opts.generated_at_max_age_seconds,
    generatedAtMaxAgeMs: opts.generatedAtMaxAgeMs,
    now: opts.now,
    workspaceRoot: pathOpts.workspaceRoot,
    allowEnvHead: opts.allowEnvHead === true,
    cliDefaultMaxAgeMs: opts.allowEnvHead === true ? 60 * 60 * 1000 : undefined,
  });
  pathOpts.trustedExpectedCommit = trusted.expectedCommit;
  pathOpts.trustedExpectedEnvironment = trusted.expectedEnvironment;
  pathOpts.generatedAtMaxAgeMs = trusted.generatedAtMaxAgeMs;
  pathOpts.now = trusted.now;
  pathOpts.signedManifest = opts.signedManifest
    ?? (opts.signed_manifest ? fileToBoundSpec(opts.signed_manifest, pathOpts, "evidence") : null);
  pathOpts.detachedSignature = opts.detachedSignature
    ?? (opts.detached_signature ? fileToBoundSpec(opts.detached_signature, pathOpts, "evidence") : null);
  const readFile = optionalReport(opts.read_report, pathOpts);
  const writeFile = optionalReport(opts.write_report, pathOpts);
  const smokeFile = optionalReport(opts.smoke_report, pathOpts);
  const specFromFile = (file, role) => {
    if (!file?.present || !file.path || !file.sha256) return { present: false };
    const rel = posixRelativeFromRoot(evidenceCompareRoot(pathOpts, role), file.path);
    if (!rel || !canonicalizeEvidencePath(rel).ok) return { present: false };
    return { path: rel, sha256: file.sha256, data: file.data };
  };
  const evaluation = evaluateCapacity({
    catalog,
    readReport: specFromFile(readFile, "input-report"),
    writeReport: specFromFile(writeFile, "input-report"),
    smokeReport: specFromFile(smokeFile, "input-report"),
    pathOpts,
  });
  const report = stampTestOnlyReport({
    ...evaluation,
    catalog_path: resolveSafePath(opts.catalog, { ...pathOpts, role: "catalog" }),
    generated_at: new Date().toISOString(),
    family: "capacity",
    task_id: CAPACITY_TASK_ID,
    target: "fixture",
    provenance: {
      generatedBy: "scripts/load/capacity-report.mjs",
      task_id: CAPACITY_TASK_ID,
      target: "fixture",
      testOnly: true,
    },
  }, {
    generatedBy: "scripts/load/capacity-report.mjs",
    taskId: CAPACITY_TASK_ID,
    targetEnvironment: "fixture",
  });
  const reportPath = resolveSafePath(opts.out, { ...pathOpts, role: "output" });
  writeReportAtomic(reportPath, report, pathOpts);
  return {
    report,
    reportPath,
    exitCode: report.decision === "GO" ? 0 : 1,
  };
}

function printHelp() {
  process.stdout.write(
    [
      "ATB-745-P0 capacity report (offline, fail-closed)",
      "",
      "  node scripts/load/capacity-report.mjs --catalog docs/release/capacity-limits.catalog.json",
      "",
      `Output defaults to ${DEFAULT_OUTPUT_DIR}. Absolute CLI paths are rejected.`,
      "Production signing requires an external key ID/public key and matching repository policy.",
      "Vercel/Turso/SNS limits require an authoritative external attestation verifier; otherwise NO_GO.",
      "",
    ].join("\n"),
  );
}

export function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseCapacityArgs(argv);
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
    const externalTrust = resolveExternalProductionTrustAnchor({
      productionKeyId: opts.production_key_id,
      productionPublicKeyPem: opts.production_public_key_pem,
      allowEnv: true,
    });
    const { report, reportPath, exitCode } = runCapacityReport({
      ...opts,
      allowEnvHead: true,
      productionTrustAnchor: externalTrust.ok ? externalTrust.anchor : null,
    });
    process.stdout.write(
      `${JSON.stringify({
        ok: exitCode === 0,
        exitCode,
        reportPath,
        decision: report.decision,
        reasons: report.reasons,
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
  (process.argv[1].endsWith("capacity-report.mjs") ||
    process.argv[1].replaceAll("\\", "/").endsWith("scripts/load/capacity-report.mjs"));

if (isDirect) {
  const code = main();
  process.exit(code ?? 0);
}
