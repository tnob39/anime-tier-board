#!/usr/bin/env node
/** Offline / fail-closed production release evidence validator. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_CHECK_IDS = Object.freeze([
  "typecheck", "build", "focused-e2e", "desktop-smoke", "mobile-smoke",
  "a11y", "console-pageerror", "overflow", "guest-journey", "auth-journey",
  "api-health-error", "health-alert", "turso-restore", "vercel-rollback", "env-checklist",
]);
export const PASS_STATUS = "pass";
export const CRITICAL_SEVERITIES = Object.freeze(["critical", "security", "privacy"]);
export const FORBIDDEN_KEY_PATTERN = /^(token|secret|password|cookie|authorization|authtoken)$/i;
export const COMMIT_RE = /^[0-9a-f]{40}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ROOT_KEYS = ["releaseCommit", "executedAt", "canonicalUrl", "operator", "monitoring", "checks", "stopBlockers", "knownIssues", "decision", "template"];
const CHECK_KEYS = ["id", "status", "commit", "executedAt", "operator", "artifactRef", "details"];

export class ValidationError extends Error { constructor(message) { super(message); this.name = "ValidationError"; } }
export class UsageError extends Error { constructor(message) { super(message); this.name = "UsageError"; } }
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const hasText = (v) => typeof v === "string" && v.trim().length > 0;
const fieldError = (label, rule = "is invalid") => { throw new ValidationError(`${label}: ${rule}`); };

export function assertNoForbiddenKeys(value, label = "$") {
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
  try { return JSON.parse(text); } catch { fieldError("input", "invalid JSON"); }
}
function requireText(obj, key, label) { if (!hasText(obj?.[key])) fieldError(`${label}.${key}`, "must be a non-empty string"); }
function requireTime(obj, key, label) {
  requireText(obj, key, label);
  if (!ISO_UTC_RE.test(obj[key]) || Number.isNaN(Date.parse(obj[key]))) fieldError(`${label}.${key}`, "must be an ISO-8601 UTC timestamp");
}
function requireRef(obj, key, label) {
  requireText(obj, key, label);
  if (/^(todo|tbd|example|placeholder|n\/a)$/i.test(obj[key].trim())) fieldError(`${label}.${key}`, "must reference real evidence");
}
function validateMonitoring(m) {
  if (!plain(m)) fieldError("monitoring", "must be an object");
  for (const key of ["dashboardRef", "alertDestinationRef", "errorBudget", "owner"]) requireRef(m, key, "monitoring");
  if (!Number.isInteger(m.onCallSlaMinutes) || m.onCallSlaMinutes <= 0) fieldError("monitoring.onCallSlaMinutes", "must be a positive integer");
}
function validateDetails(check, label) {
  const d = check.details;
  if (!plain(d)) fieldError(`${label}.details`, "must be an object");
  if (check.id === "guest-journey" || check.id === "auth-journey") {
    requireRef(d, "journeyRef", `${label}.details`);
    if (d.canonicalUrlVerified !== true) fieldError(`${label}.details.canonicalUrlVerified`, "must be true");
  } else if (check.id === "api-health-error") {
    if (!Array.isArray(d.apiIds) || d.apiIds.length === 0 || d.apiIds.some((v) => !hasText(v))) fieldError(`${label}.details.apiIds`, "must be a non-empty ID list");
    if (d.healthVerified !== true || d.errorMonitoringVerified !== true) fieldError(`${label}.details`, "health and error monitoring must be verified");
  } else if (check.id === "turso-restore") {
    requireRef(d, "backupRef", `${label}.details`);
    if (d.restoreTarget !== "disposable" || d.restoreResult !== "pass" || d.integrityResult !== "pass") fieldError(`${label}.details`, "disposable restore and integrity results must pass");
  } else if (check.id === "vercel-rollback") {
    requireRef(d, "rollbackDeploymentRef", `${label}.details`);
    if (d.rollbackResult !== "pass") fieldError(`${label}.details.rollbackResult`, "must be pass");
  }
}
function collectChecks(raw, releaseCommit) {
  if (!Array.isArray(raw)) fieldError("checks", "must be an array");
  const seen = new Set(), failedChecks = [], shaMismatches = [];
  raw.forEach((c, i) => {
    const label = `checks[${i}]`;
    if (!plain(c)) fieldError(label, "must be an object");
    for (const key of Object.keys(c)) if (!CHECK_KEYS.includes(key)) fieldError(label, "contains an unknown field");
    if (!REQUIRED_CHECK_IDS.includes(c.id)) fieldError(`${label}.id`, "must be a required check ID");
    if (seen.has(c.id)) fieldError(`${label}.id`, "must be unique");
    seen.add(c.id);
    if (!hasText(c.status)) fieldError(`${label}.status`, "must be a non-empty string");
    assertValidCommit(c.commit, `${label}.commit`); requireTime(c, "executedAt", label); requireRef(c, "operator", label); requireRef(c, "artifactRef", label);
    validateDetails(c, label);
    if (c.status !== PASS_STATUS) failedChecks.push(c.id);
    if (c.commit !== releaseCommit) shaMismatches.push(c.id);
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
    if (CRITICAL_SEVERITIES.includes(x.severity.toLowerCase()) && !["resolved", "closed"].includes(x.status.toLowerCase())) count++;
  }); return count;
}
export function evaluateReleaseEvidence(data) {
  if (!plain(data)) fieldError("root", "must be an object");
  assertNoForbiddenKeys(data);
  for (const key of Object.keys(data)) if (!ROOT_KEYS.includes(key)) fieldError("root", "contains an unknown field");
  assertValidCommit(data.releaseCommit); requireTime(data, "executedAt", "root"); requireRef(data, "canonicalUrl", "root");
  try { const u = new URL(data.canonicalUrl); if (u.protocol !== "https:" || u.pathname !== "/" || u.search || u.hash) fieldError("canonicalUrl", "must be the production HTTPS origin"); } catch (e) { if (e instanceof ValidationError) throw e; fieldError("canonicalUrl", "must be the production HTTPS origin"); }
  requireRef(data, "operator", "root"); validateMonitoring(data.monitoring);
  const result = collectChecks(data.checks, data.releaseCommit);
  const blockerCount = countBlockers(data.stopBlockers, "stopBlockers") + criticalCount(data.knownIssues);
  const reasons = [];
  if (data.template === true) reasons.push("templateEvidence");
  if (result.missingChecks.length) reasons.push("missingChecks"); if (result.failedChecks.length) reasons.push("failedChecks");
  if (result.shaMismatches.length) reasons.push("shaMismatches"); if (blockerCount) reasons.push("stopBlockers");
  let decision = reasons.length ? "NO_GO" : "GO";
  if (data.decision != null) { if (!["GO", "NO_GO"].includes(data.decision)) fieldError("decision", "must be GO or NO_GO"); if (data.decision !== decision) { decision = "NO_GO"; reasons.push("decisionMismatch"); } }
  return { decision, missingChecks: result.missingChecks, failedChecks: result.failedChecks, shaMismatches: result.shaMismatches, blockerCount, reasons };
}
export function loadAndEvaluateEvidenceFile(filePath) {
  const buf = fs.readFileSync(path.resolve(filePath));
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fieldError("input", "BOM is not allowed");
  let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { fieldError("input", "invalid UTF-8"); }
  return evaluateReleaseEvidence(parseEvidenceJson(text));
}
export const formatReport = (r) => `${JSON.stringify(r, null, 2)}\n`;
export function usageText() { return `Usage: node scripts/validate-release-evidence.mjs <evidence.json>\nEvidence path is required. Offline validation; credential values are prohibited.\n`; }
export function parseCliArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { mode: "help" };
  if (argv.some((a) => a.startsWith("-"))) throw new UsageError("usage error: unknown or mixed option");
  if (argv.length !== 1) throw new UsageError("usage error: exactly one evidence path is required");
  return { mode: "validate", filePath: path.resolve(argv[0]) };
}
const safeFailure = (kind) => ({ decision: "NO_GO", missingChecks: [], failedChecks: [], shaMismatches: [], blockerCount: 1, reasons: [kind] });
export function main(argv = process.argv.slice(2)) {
  let p; try { p = parseCliArgs(argv); } catch { process.stdout.write(formatReport(safeFailure("usageError"))); process.stderr.write(usageText()); process.exitCode = 1; return 1; }
  if (p.mode === "help") { process.stdout.write(usageText()); process.exitCode = 0; return 0; }
  try { const r = loadAndEvaluateEvidenceFile(p.filePath); process.stdout.write(formatReport(r)); process.exitCode = r.decision === "GO" ? 0 : 1; return process.exitCode; }
  catch { process.stdout.write(formatReport(safeFailure("validationError"))); process.stderr.write("検証失敗: evidence の形式または必須項目を確認してください。\n"); process.exitCode = 1; return 1; }
}
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) main();
