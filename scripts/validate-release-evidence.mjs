#!/usr/bin/env node
/** Offline / fail-closed production release evidence validator. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isBoundEvidenceSpec, loadBoundJson, CAPACITY_TASK_ID } from "./load/capacity-report.mjs";
import { WORKSPACE_ROOT } from "./load/safe-path.mjs";
import {
  productionVerifier,
  evaluateSignedManifest,
  resolveTrustedReleasePolicy,
  resolveExternalProductionTrustAnchor,
  COMMIT_RE,
  DEFAULT_GENERATED_AT_MAX_AGE_MS,
  normalizeEvidenceEntry,
  hasPrototypePollutionKey,
} from "./load/signed-provenance.mjs";
import {
  parseJsonStrict,
  StrictJsonError,
  isPlainOwnDataObject,
  isPlainOwnDataTree,
  ownDataValue,
} from "./load/strict-json.mjs";

export const REQUIRED_CHECK_IDS = Object.freeze([
  "typecheck", "build", "focused-e2e", "desktop-smoke", "mobile-smoke",
  "a11y", "console-pageerror", "overflow", "guest-journey", "auth-journey",
  "api-health-error", "health-alert", "turso-restore", "vercel-rollback", "env-checklist",
]);
export const PASS_STATUS = "pass";
export const CRITICAL_SEVERITIES = Object.freeze(["critical", "security", "privacy"]);
export const FORBIDDEN_KEY_PATTERN = /^(token|secret|password|cookie|authorization|authtoken)$/i;
export { COMMIT_RE };
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ROOT_KEYS = ["releaseCommit", "executedAt", "canonicalUrl", "operator", "monitoring", "checks", "stopBlockers", "knownIssues", "decision", "template", "signedManifest", "detachedSignature", "capacityReport"];
const CHECK_KEYS = ["id", "status", "commit", "executedAt", "operator", "artifactRef", "details"];

export class ValidationError extends Error { constructor(message) { super(message); this.name = "ValidationError"; } }
export class UsageError extends Error { constructor(message) { super(message); this.name = "UsageError"; } }
const plain = isPlainOwnDataObject;
const hasText = (v) => typeof v === "string" && v.trim().length > 0;
const fieldError = (label, rule = "is invalid") => { throw new ValidationError(`${label}: ${rule}`); };

export function assertNoForbiddenKeys(value, label = "$") {
  if (!isPlainOwnDataTree(value)) fieldError(label, "must contain only plain own data");
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoForbiddenKeys(v, `${label}[${i}]`));
  if (!plain(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) fieldError(label, "contains a forbidden credential field");
    assertNoForbiddenKeys(child, `${label}.${key}`);
  }
}
export function assertValidCommit(value, label = "releaseCommit") {
  if (typeof value !== "string" || !COMMIT_RE.test(value)) fieldError(label, "must be a 40-char lowercase hex git SHA");
}
export function parseEvidenceJson(text) {
  if (typeof text !== "string") fieldError("input", "must be a string");
  if (text.charCodeAt(0) === 0xfeff) fieldError("input", "BOM is not allowed");
  try {
    return parseJsonStrict(text, "evidence");
  } catch (err) {
    if (err instanceof StrictJsonError && err.code === "duplicateKey") {
      fieldError("input", "duplicate object keys are not allowed");
    }
    fieldError("input", "invalid JSON");
  }
}
function requireText(obj, key, label) { if (!Object.hasOwn(obj, key) || !hasText(ownDataValue(obj, key))) fieldError(`${label}.${key}`, "must be a non-empty string"); }
function requireTime(obj, key, label) {
  requireText(obj, key, label);
  const value = ownDataValue(obj, key);
  if (!ISO_UTC_RE.test(value) || Number.isNaN(Date.parse(value))) fieldError(`${label}.${key}`, "must be an ISO-8601 UTC timestamp");
}
function requireRef(obj, key, label) {
  requireText(obj, key, label);
  if (/^(todo|tbd|example|placeholder|n\/a)$/i.test(ownDataValue(obj, key).trim())) fieldError(`${label}.${key}`, "must reference real evidence");
}

function isTestOnlyPayload(data) {
  if (!plain(data)) return true;
  const provenance = ownDataValue(data, "provenance");
  if (ownDataValue(data, "testOnly") !== false) return true;
  if (provenance && ownDataValue(provenance, "testOnly") !== false) return true;
  if (ownDataValue(provenance, "kind") === "test") return true;
  return false;
}

function productionGoFields(data, trustedCommit, expectedTaskId) {
  if (isTestOnlyPayload(data)) return "testOnlyEvidence";
  const provenance = ownDataValue(data, "provenance");
  const target = ownDataValue(data, "target") ?? ownDataValue(provenance, "targetEnvironment");
  if (target != null && target !== "production") return "nonProductionProvenance";
  const taskId = String(ownDataValue(data, "task_id") || ownDataValue(data, "taskId") || ownDataValue(provenance, "taskId") || "").trim();
  if (expectedTaskId) {
    if (!taskId) return "missingTaskId";
    if (taskId !== expectedTaskId) return "taskIdMismatch";
  }
  const commit = ownDataValue(data, "commit") ?? ownDataValue(provenance, "commit");
  if (trustedCommit && commit && commit !== trustedCommit) return "staleOrWrongCommit";
  return null;
}

function bindRef(value, pathOpts, prove) {
  if (!isBoundEvidenceSpec(value)) return { ok: false, reason: "unboundEvidence" };
  const loaded = loadBoundJson(value, pathOpts, "evidence");
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  if (isTestOnlyPayload(loaded.data)) return { ok: false, reason: "testOnlyEvidence" };
  if (hasPrototypePollutionKey(loaded.data) || !plain(loaded.data)) return { ok: false, reason: "prototypeKeyRejected" };
  if (!prove(loaded.data)) return { ok: false, reason: "evidenceDoesNotProveCheck" };
  return { ok: true, data: loaded.data };
}

function proveCheckArtifact(check, releaseCommit, canonicalUrl) {
  return (data) => {
    if (!plain(data)) return false;
    if (ownDataValue(data, "checkId") !== ownDataValue(check, "id") || ownDataValue(data, "status") !== PASS_STATUS) return false;
    if (ownDataValue(data, "commit") !== releaseCommit) return false;
    const checkId = ownDataValue(check, "id");
    if (checkId === "guest-journey" || checkId === "auth-journey") {
      return ownDataValue(data, "canonicalUrlVerified") === true && ownDataValue(data, "canonicalUrl") === canonicalUrl;
    }
    if (checkId === "api-health-error") {
      return Array.isArray(ownDataValue(data, "apiIds")) && ownDataValue(data, "apiIds").length > 0 && ownDataValue(data, "healthVerified") === true && ownDataValue(data, "errorMonitoringVerified") === true;
    }
    if (checkId === "turso-restore") {
      return ownDataValue(data, "restoreTarget") === "disposable" && ownDataValue(data, "restoreResult") === "pass" && ownDataValue(data, "integrityResult") === "pass";
    }
    if (checkId === "vercel-rollback") {
      return ownDataValue(data, "rollbackResult") === "pass";
    }
    return true;
  };
}

function pushRequired(list, spec, semanticType) {
  if (!isBoundEvidenceSpec(spec)) return;
  list.push(normalizeEvidenceEntry({ path: ownDataValue(spec, "path"), sha256: ownDataValue(spec, "sha256"), semanticType }));
}

function collectRequiredEvidence(data) {
  const required = [];
  const monitoring = ownDataValue(data, "monitoring");
  if (plain(monitoring)) {
    pushRequired(required, ownDataValue(monitoring, "dashboardRef"), "dashboard");
    pushRequired(required, ownDataValue(monitoring, "alertDestinationRef"), "alert");
  }
  const checks = ownDataValue(data, "checks");
  if (Array.isArray(checks)) {
    for (const check of checks) {
      if (!plain(check)) continue;
      pushRequired(required, ownDataValue(check, "artifactRef"), "release-check");
      const d = ownDataValue(check, "details");
      if (!plain(d)) continue;
      const checkId = ownDataValue(check, "id");
      if (checkId === "guest-journey" || checkId === "auth-journey") {
        pushRequired(required, ownDataValue(d, "journeyRef"), "journey");
      }
      if (checkId === "turso-restore") {
        pushRequired(required, ownDataValue(d, "backupRef"), "turso-backup");
      }
      if (checkId === "vercel-rollback") {
        pushRequired(required, ownDataValue(d, "rollbackDeploymentRef"), "vercel-rollback");
      }
    }
  }
  pushRequired(required, ownDataValue(data, "capacityReport"), "capacity-report");
  return required;
}

function validateMonitoring(m, pathOpts, reasons) {
  if (!plain(m)) fieldError("monitoring", "must be an object");
  for (const key of ["errorBudget", "owner"]) requireRef(m, key, "monitoring");
  const sla = ownDataValue(m, "onCallSlaMinutes");
  if (!Number.isInteger(sla) || sla <= 0) fieldError("monitoring.onCallSlaMinutes", "must be a positive integer");
  for (const key of ["dashboardRef", "alertDestinationRef"]) {
    const value = ownDataValue(m, key);
    if (value == null) fieldError(`monitoring.${key}`, "must be bound evidence");
    const bound = bindRef(value, pathOpts, (data) => ownDataValue(data, "kind") === (key === "dashboardRef" ? "dashboard" : "alert"));
    if (!bound.ok) reasons.push(bound.reason);
  }
}

function validateDetails(check, label, releaseCommit, canonicalUrl, pathOpts, reasons) {
  const d = ownDataValue(check, "details");
  if (!plain(d)) fieldError(`${label}.details`, "must be an object");
  const checkId = ownDataValue(check, "id");
  if (checkId === "guest-journey" || checkId === "auth-journey") {
    if (ownDataValue(d, "canonicalUrlVerified") !== true) fieldError(`${label}.details.canonicalUrlVerified`, "must be true");
    const bound = bindRef(ownDataValue(d, "journeyRef"), pathOpts, proveCheckArtifact(check, releaseCommit, canonicalUrl));
    if (!bound.ok) reasons.push(bound.reason);
  } else if (checkId === "api-health-error") {
    const apiIds = ownDataValue(d, "apiIds");
    if (!Array.isArray(apiIds) || apiIds.length === 0 || apiIds.some((v) => !hasText(v))) fieldError(`${label}.details.apiIds`, "must be a non-empty ID list");
    if (ownDataValue(d, "healthVerified") !== true || ownDataValue(d, "errorMonitoringVerified") !== true) fieldError(`${label}.details`, "health and error monitoring must be verified");
  } else if (checkId === "turso-restore") {
    if (ownDataValue(d, "restoreTarget") !== "disposable" || ownDataValue(d, "restoreResult") !== "pass" || ownDataValue(d, "integrityResult") !== "pass") fieldError(`${label}.details`, "disposable restore and integrity results must pass");
    const bound = bindRef(ownDataValue(d, "backupRef"), pathOpts, (data) => ownDataValue(data, "kind") === "turso-backup" && ownDataValue(data, "commit") === releaseCommit && ownDataValue(data, "restoreTarget") === "disposable");
    if (!bound.ok) reasons.push(bound.reason);
  } else if (checkId === "vercel-rollback") {
    if (ownDataValue(d, "rollbackResult") !== "pass") fieldError(`${label}.details.rollbackResult`, "must be pass");
    const bound = bindRef(ownDataValue(d, "rollbackDeploymentRef"), pathOpts, (data) => ownDataValue(data, "kind") === "vercel-rollback" && ownDataValue(data, "commit") === releaseCommit && ownDataValue(data, "rollbackResult") === "pass");
    if (!bound.ok) reasons.push(bound.reason);
  }
}

function collectChecks(raw, releaseCommit, canonicalUrl, pathOpts, reasons) {
  if (!Array.isArray(raw)) fieldError("checks", "must be an array");
  const seen = new Set(), failedChecks = [], shaMismatches = [];
  raw.forEach((c, i) => {
    const label = `checks[${i}]`;
    if (!plain(c)) fieldError(label, "must be an object");
    for (const key of Object.keys(c)) if (!CHECK_KEYS.includes(key)) fieldError(label, "contains an unknown field");
    const id = ownDataValue(c, "id");
    if (!REQUIRED_CHECK_IDS.includes(id)) fieldError(`${label}.id`, "must be a required check ID");
    if (seen.has(id)) fieldError(`${label}.id`, "must be unique");
    seen.add(id);
    if (!hasText(ownDataValue(c, "status"))) fieldError(`${label}.status`, "must be a non-empty string");
    assertValidCommit(ownDataValue(c, "commit"), `${label}.commit`); requireTime(c, "executedAt", label); requireRef(c, "operator", label);
    const artifactRef = ownDataValue(c, "artifactRef");
    if (artifactRef == null) fieldError(`${label}.artifactRef`, "must be bound evidence");
    const artifact = bindRef(artifactRef, pathOpts, proveCheckArtifact(c, releaseCommit, canonicalUrl));
    if (!artifact.ok) reasons.push(artifact.reason);
    validateDetails(c, label, releaseCommit, canonicalUrl, pathOpts, reasons);
    if (ownDataValue(c, "status") !== PASS_STATUS) failedChecks.push(id);
    if (ownDataValue(c, "commit") !== releaseCommit) shaMismatches.push(id);
  });
  return { missingChecks: REQUIRED_CHECK_IDS.filter((id) => !seen.has(id)), failedChecks, shaMismatches };
}
function countBlockers(value, label) {
  if (value === undefined) return 0;
  if (!Array.isArray(value)) fieldError(label, "must be an array");
  return value.length;
}
function criticalCount(issues) {
  if (issues === undefined) return 0;
  if (!Array.isArray(issues)) fieldError("knownIssues", "must be an array");
  let count = 0;
  issues.forEach((x, i) => {
    const label = `knownIssues[${i}]`; if (!plain(x)) fieldError(label, "must be an object");
    requireText(x, "severity", label); requireText(x, "status", label);
    if (CRITICAL_SEVERITIES.includes(ownDataValue(x, "severity").toLowerCase()) && !["resolved", "closed"].includes(ownDataValue(x, "status").toLowerCase())) count++;
  }); return count;
}

function capacityEntryMatches(manifest, spec) {
  if (!isBoundEvidenceSpec(spec) || !plain(manifest) || !Array.isArray(ownDataValue(manifest, "evidence"))) return false;
  const want = normalizeEvidenceEntry({ path: ownDataValue(spec, "path"), sha256: ownDataValue(spec, "sha256"), semanticType: "capacity-report" });
  return ownDataValue(manifest, "evidence").some((row) => {
    const n = normalizeEvidenceEntry(row);
    return n.path === want.path && n.sha256 === want.sha256 && n.semanticType === "capacity-report";
  });
}

function verifyCapacityReport(spec, manifest, pathOpts, reasons) {
  if (!spec) {
    reasons.push("missingCapacityReport");
    return;
  }
  const loaded = loadBoundJson(spec, pathOpts, "evidence");
  if (!loaded.ok) {
    reasons.push(loaded.reason === "unboundEvidence" ? "missingCapacityReport" : loaded.reason);
    return;
  }
  if (ownDataValue(loaded.data, "decision") !== "GO") reasons.push("capacityDecisionNotGo");
  if (ownDataValue(loaded.data, "task_id") !== CAPACITY_TASK_ID) {
    reasons.push("invalidCapacityReport");
  }
  if (isTestOnlyPayload(loaded.data)) reasons.push("testOnlyEvidence");
  const provenance = ownDataValue(loaded.data, "provenance");
  if ((ownDataValue(loaded.data, "target") ?? ownDataValue(provenance, "targetEnvironment")) !== "production") {
    reasons.push("nonProductionProvenance");
  }
  const capTask = String(ownDataValue(loaded.data, "task_id") || ownDataValue(provenance, "taskId") || "").trim();
  if (!capTask) reasons.push("missingTaskId");
  if (
    capTask !== CAPACITY_TASK_ID ||
    ownDataValue(provenance, "taskId") !== CAPACITY_TASK_ID ||
    ownDataValue(provenance, "task_id") !== CAPACITY_TASK_ID
  ) {
    reasons.push("invalidTaskProvenance");
  }
  if (manifest) {
    if (!capacityEntryMatches(manifest, spec)) reasons.push("capacityReportMismatch");
    if (ownDataValue(manifest, "capacityDecision") !== "GO") reasons.push("capacityDecisionNotGo");
  }
}

function trustedFromPathOpts(pathOpts) {
  return resolveTrustedReleasePolicy({
    expectedCommit: ownDataValue(pathOpts, "trustedExpectedCommit") ?? ownDataValue(pathOpts, "expectedCommit"),
    expectedEnvironment: ownDataValue(pathOpts, "trustedExpectedEnvironment") ?? ownDataValue(pathOpts, "expectedEnvironment"),
    generatedAtMaxAgeMs: ownDataValue(pathOpts, "generatedAtMaxAgeMs"),
    generatedAtMaxAgeSeconds: ownDataValue(pathOpts, "generatedAtMaxAgeSeconds"),
    now: ownDataValue(pathOpts, "now"),
    workspaceRoot: ownDataValue(pathOpts, "workspaceRoot"),
    allowEnvHead: false,
  });
}

export function evaluateReleaseEvidence(data, pathOpts = {}) {
  if (!plain(data)) fieldError("root", "must be an object");
  pathOpts = isPlainOwnDataObject(pathOpts) ? pathOpts : {};
  if (hasPrototypePollutionKey(data)) fieldError("root", "contains a prototype pollution key");
  assertNoForbiddenKeys(data);
  for (const key of Object.keys(data)) if (!ROOT_KEYS.includes(key)) fieldError("root", "contains an unknown field");
  assertValidCommit(ownDataValue(data, "releaseCommit")); requireTime(data, "executedAt", "root"); requireRef(data, "canonicalUrl", "root");
  try { const u = new URL(ownDataValue(data, "canonicalUrl")); if (u.protocol !== "https:" || u.pathname !== "/" || u.search || u.hash) fieldError("canonicalUrl", "must be the production HTTPS origin"); } catch (e) { if (e instanceof ValidationError) throw e; fieldError("canonicalUrl", "must be the production HTTPS origin"); }
  requireRef(data, "operator", "root");
  const reasons = [];
  const opts = {
    ...pathOpts,
    workspaceRoot: Object.hasOwn(pathOpts, "workspaceRoot") && pathOpts.workspaceRoot != null ? pathOpts.workspaceRoot : WORKSPACE_ROOT,
    trustedOutputRoot: Object.hasOwn(pathOpts, "trustedOutputRoot") ? pathOpts.trustedOutputRoot : undefined,
  };
  const trusted = trustedFromPathOpts({ ...pathOpts, workspaceRoot: ownDataValue(opts, "workspaceRoot") });
  if (!trusted.expectedCommit) reasons.push("missingTrustedCommit");
  else if (ownDataValue(data, "releaseCommit") !== trusted.expectedCommit) reasons.push("staleOrWrongCommit");
  if (typeof trusted.generatedAtMaxAgeMs !== "number" || !Number.isFinite(trusted.generatedAtMaxAgeMs) || trusted.generatedAtMaxAgeMs <= 0) {
    reasons.push("missingFreshnessPolicy");
  }
  validateMonitoring(ownDataValue(data, "monitoring"), opts, reasons);
  const result = collectChecks(ownDataValue(data, "checks"), ownDataValue(data, "releaseCommit"), ownDataValue(data, "canonicalUrl"), opts, reasons);
  const blockerCount = countBlockers(ownDataValue(data, "stopBlockers"), "stopBlockers") + criticalCount(ownDataValue(data, "knownIssues"));
  if (ownDataValue(data, "template") === true) reasons.push("templateEvidence");
  const signer = productionVerifier(ownDataValue(opts, "workspaceRoot"), ownDataValue(opts, "productionTrustAnchor"));
  if (!signer.ok) reasons.push(signer.reason);
  const requiredEvidence = collectRequiredEvidence(data);
  const signedManifest = ownDataValue(data, "signedManifest");
  const detachedSignature = ownDataValue(data, "detachedSignature");
  if (!isBoundEvidenceSpec(signedManifest) || !isBoundEvidenceSpec(detachedSignature)) {
    reasons.push("missingSignedProvenance");
    verifyCapacityReport(ownDataValue(data, "capacityReport"), null, opts, reasons);
  } else if (signer.ok) {
    const signed = evaluateSignedManifest({
      manifestSpec: signedManifest,
      signatureSpec: detachedSignature,
      pathOpts: opts,
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
      const capacityReport = ownDataValue(data, "capacityReport");
      if (capacityReport && isBoundEvidenceSpec(capacityReport)) {
        const loadedCap = loadBoundJson(capacityReport, opts, "evidence");
        if (loadedCap.ok) {
          const mismatch = productionGoFields(loadedCap.data, trusted.expectedCommit, ownDataValue(signed.manifest, "taskId"));
          if (mismatch) reasons.push(mismatch);
        }
      }
    }
    verifyCapacityReport(ownDataValue(data, "capacityReport"), signed.ok ? signed.manifest : null, opts, reasons);
  } else {
    verifyCapacityReport(ownDataValue(data, "capacityReport"), null, opts, reasons);
  }
  if (result.missingChecks.length) reasons.push("missingChecks"); if (result.failedChecks.length) reasons.push("failedChecks");
  if (result.shaMismatches.length) reasons.push("shaMismatches"); if (blockerCount) reasons.push("stopBlockers");
  const uniqueReasons = [...new Set(reasons)];
  let decision = uniqueReasons.length ? "NO_GO" : "GO";
  if (Object.hasOwn(data, "decision") && ownDataValue(data, "decision") != null) { if (!["GO", "NO_GO"].includes(ownDataValue(data, "decision"))) fieldError("decision", "must be GO or NO_GO"); if (ownDataValue(data, "decision") !== decision) { decision = "NO_GO"; uniqueReasons.push("decisionMismatch"); } }
  return { decision, missingChecks: result.missingChecks, failedChecks: result.failedChecks, shaMismatches: result.shaMismatches, blockerCount, reasons: [...new Set(uniqueReasons)] };
}
export function loadAndEvaluateEvidenceFile(filePath, pathOpts = {}) {
  const buf = fs.readFileSync(path.resolve(filePath));
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fieldError("input", "BOM is not allowed");
  let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { fieldError("input", "invalid UTF-8"); }
  return evaluateReleaseEvidence(parseEvidenceJson(text), pathOpts);
}
export const formatReport = (r) => `${JSON.stringify(r, null, 2)}\n`;
export function usageText() {
  return [
    "Usage: node scripts/validate-release-evidence.mjs <evidence.json> [trusted options]",
    "Evidence path is required. Offline validation; credential values are prohibited.",
    "",
    "Trusted inputs are NEVER taken from evidence JSON (including releaseCommit):",
    "  --expected-commit <40-hex>     or ATB_EXPECTED_COMMIT or GITHUB_SHA or git rev-parse HEAD",
    "  --expected-environment <name>  or ATB_EXPECTED_ENVIRONMENT (default: production)",
    "  --generated-at-max-age-seconds <n>  or ATB_GENERATED_AT_MAX_AGE_SECONDS (CLI default: 3600)",
    "  --production-key-id <id>       or ATB_PRODUCTION_KEY_ID (external CI/runtime trust anchor)",
    "  --production-public-key-pem <pem> or ATB_PRODUCTION_PUBLIC_KEY_PEM (external CI/runtime trust anchor)",
    "A signed historical GO for a different/stale commit than the trusted SHA is NO_GO.",
    "",
  ].join("\n");
}
export function parseCliArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { mode: "help" };
  let filePath = null;
  const trusted = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null) throw new UsageError("usage error: unknown or mixed option");
      return v;
    };
    if (a === "--expected-commit") {
      trusted.expectedCommit = next();
      continue;
    }
    if (a === "--expected-environment") {
      trusted.expectedEnvironment = next();
      continue;
    }
    if (a === "--generated-at-max-age-seconds") {
      trusted.generatedAtMaxAgeSeconds = Number(next());
      continue;
    }
    if (a === "--production-key-id") {
      trusted.productionKeyId = next();
      continue;
    }
    if (a === "--production-public-key-pem") {
      trusted.productionPublicKeyPem = next();
      continue;
    }
    if (a.startsWith("-")) throw new UsageError("usage error: unknown or mixed option");
    if (filePath) throw new UsageError("usage error: exactly one evidence path is required");
    filePath = a;
  }
  if (!filePath) throw new UsageError("usage error: exactly one evidence path is required");
  return { mode: "validate", filePath: path.resolve(filePath), trusted };
}
const safeFailure = (kind) => ({ decision: "NO_GO", missingChecks: [], failedChecks: [], shaMismatches: [], blockerCount: 1, reasons: [kind] });
export function main(argv = process.argv.slice(2), env = process.env) {
  let p; try { p = parseCliArgs(argv); } catch { process.stdout.write(formatReport(safeFailure("usageError"))); process.stderr.write(usageText()); process.exitCode = 1; return 1; }
  if (p.mode === "help") { process.stdout.write(usageText()); process.exitCode = 0; return 0; }
  try {
    const trusted = resolveTrustedReleasePolicy({
      ...p.trusted,
      workspaceRoot: WORKSPACE_ROOT,
      allowEnvHead: true,
      cliDefaultMaxAgeMs: DEFAULT_GENERATED_AT_MAX_AGE_MS,
    }, env);
    const externalTrust = resolveExternalProductionTrustAnchor({
      productionKeyId: p.trusted.productionKeyId,
      productionPublicKeyPem: p.trusted.productionPublicKeyPem,
      allowEnv: true,
    }, env);
    const r = loadAndEvaluateEvidenceFile(p.filePath, {
      workspaceRoot: WORKSPACE_ROOT,
      trustedExpectedCommit: trusted.expectedCommit,
      trustedExpectedEnvironment: trusted.expectedEnvironment,
      generatedAtMaxAgeMs: trusted.generatedAtMaxAgeMs,
      now: trusted.now,
      productionTrustAnchor: externalTrust.ok ? externalTrust.anchor : null,
    });
    process.stdout.write(formatReport(r)); process.exitCode = r.decision === "GO" ? 0 : 1; return process.exitCode;
  }
  catch { process.stdout.write(formatReport(safeFailure("validationError"))); process.stderr.write("検証失敗: evidence の形式または必須項目を確認してください。\n"); process.exitCode = 1; return 1; }
}
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) main();
