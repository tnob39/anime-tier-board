import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { REQUIRED_CHECK_IDS, ValidationError, evaluateReleaseEvidence, loadAndEvaluateEvidenceFile, parseCliArgs } from "../scripts/validate-release-evidence.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "scripts", "validate-release-evidence.mjs");
const EXAMPLE = path.join(ROOT, "docs", "release", "release-evidence.example.json");
const SHA = "ac00b96207bc8cb3a6a98dac6e306a7bca6ff4a5";
const TIME = "2026-08-23T10:00:00Z";
function details(id) {
  if (["guest-journey", "auth-journey"].includes(id)) return { journeyRef: `artifact://${id}/run-42`, canonicalUrlVerified: true };
  if (id === "api-health-error") return { apiIds: ["auth-session", "shares-list"], healthVerified: true, errorMonitoringVerified: true };
  if (id === "turso-restore") return { backupRef: "artifact://turso/backup-42", restoreTarget: "disposable", restoreResult: "pass", integrityResult: "pass" };
  if (id === "vercel-rollback") return { rollbackDeploymentRef: "artifact://vercel/deployment-41", rollbackResult: "pass" };
  return {};
}
function evidence(overrides = {}) {
  return {
    releaseCommit: SHA, executedAt: TIME, canonicalUrl: "https://anime.example.jp/", operator: "release-owner-1",
    monitoring: { dashboardRef: "monitor://production/dashboard", alertDestinationRef: "alert://release-oncall", errorBudget: "99.9% monthly availability", owner: "production-team", onCallSlaMinutes: 15 },
    checks: REQUIRED_CHECK_IDS.map((id) => ({ id, status: "pass", commit: SHA, executedAt: TIME, operator: "release-owner-1", artifactRef: `artifact://release-42/${id}`, details: details(id) })),
    stopBlockers: [], knownIssues: [], ...overrides,
  };
}
function cliFile(data) { const d = fs.mkdtempSync(path.join(os.tmpdir(), "atb742-")); const f = path.join(d, "evidence.json"); fs.writeFileSync(f, JSON.stringify(data)); return spawnSync(process.execPath, [CLI, f], { encoding: "utf8" }); }

test("GO: production evidence has canonical journeys, monitoring, restore and rollback proof", () => assert.equal(evaluateReleaseEvidence(evidence()).decision, "GO"));
test("NO_GO: missing, failed and mixed-SHA checks remain fail closed", () => {
  const missing = evidence(); missing.checks.pop(); assert.equal(evaluateReleaseEvidence(missing).decision, "NO_GO");
  const failed = evidence(); failed.checks[0].status = "fail"; assert.deepEqual(evaluateReleaseEvidence(failed).failedChecks, ["typecheck"]);
  const mixed = evidence(); mixed.checks[1].commit = "b".repeat(40); assert.deepEqual(evaluateReleaseEvidence(mixed).shaMismatches, ["build"]);
});
test("NO_GO: template/example can never become GO", () => { const x = evidence({ template: true, decision: "NO_GO" }); assert.equal(evaluateReleaseEvidence(x).decision, "NO_GO"); assert.ok(evaluateReleaseEvidence(x).reasons.includes("templateEvidence")); });
test("repository example is intentionally NO_GO", () => assert.equal(loadAndEvaluateEvidenceFile(EXAMPLE).decision, "NO_GO"));
test("required root evidence fields are enforced", () => {
  for (const key of ["executedAt", "canonicalUrl", "operator", "monitoring"]) { const x = evidence(); delete x[key]; assert.throws(() => evaluateReleaseEvidence(x), ValidationError); }
});
test("canonical URL must be production HTTPS origin", () => { for (const canonicalUrl of ["http://anime.example.jp/", "https://anime.example.jp/path", "TBD"]) assert.throws(() => evaluateReleaseEvidence(evidence({ canonicalUrl })), ValidationError); });
test("every check requires execution time, operator and artifact reference", () => {
  for (const key of ["executedAt", "operator", "artifactRef"]) { const x = evidence(); delete x.checks[0][key]; assert.throws(() => evaluateReleaseEvidence(x), ValidationError); }
});
test("guest and authenticated canonical journeys must be verified", () => { for (const id of ["guest-journey", "auth-journey"]) { const x = evidence(); x.checks.find((c) => c.id === id).details.canonicalUrlVerified = false; assert.throws(() => evaluateReleaseEvidence(x), ValidationError); } });
test("API health and error monitoring evidence is mandatory", () => { const x = evidence(); x.checks.find((c) => c.id === "api-health-error").details.errorMonitoringVerified = false; assert.throws(() => evaluateReleaseEvidence(x), ValidationError); });
test("monitoring requires budget, owner, SLA and alert destination", () => { for (const key of ["dashboardRef", "alertDestinationRef", "errorBudget", "owner", "onCallSlaMinutes"]) { const x = evidence(); delete x.monitoring[key]; assert.throws(() => evaluateReleaseEvidence(x), ValidationError); } });
test("Turso proof requires backup, disposable restore and integrity pass", () => { for (const key of ["backupRef", "restoreTarget", "restoreResult", "integrityResult"]) { const x = evidence(); const d = x.checks.find((c) => c.id === "turso-restore").details; if (key === "backupRef") delete d[key]; else d[key] = "fail"; assert.throws(() => evaluateReleaseEvidence(x), ValidationError); } });
test("Vercel rollback rehearsal requires deployment reference and pass result", () => { const x = evidence(); x.checks.find((c) => c.id === "vercel-rollback").details.rollbackResult = "fail"; assert.throws(() => evaluateReleaseEvidence(x), ValidationError); });
test("blocker values and known issue values are never emitted", () => { const marker = "PRIVATE_ARBITRARY_VALUE_742"; const r = evaluateReleaseEvidence(evidence({ stopBlockers: [marker], knownIssues: [{ id: marker, severity: "security", status: marker }] })); assert.equal(r.decision, "NO_GO"); assert.equal(JSON.stringify(r).includes(marker), false); });
test("CLI never echoes arbitrary values on any validation failure", () => { const marker = "sk-live-PRIVATE-DO-NOT-ECHO"; const x = evidence({ canonicalUrl: marker }); x.stopBlockers = [marker]; const r = cliFile(x); assert.notEqual(r.status, 0); assert.equal(`${r.stdout}${r.stderr}`.includes(marker), false); assert.deepEqual(JSON.parse(r.stdout).reasons, ["validationError"]); });
test("unknown and forbidden field names do not echo attacker-controlled names", () => { const marker = "secretAttackerField742"; const x = evidence(); x[marker] = "value"; const r = cliFile(x); assert.equal(`${r.stdout}${r.stderr}`.includes(marker), false); });
test("CLI argument values and missing paths are never echoed", () => { const marker = "PRIVATE-PATH-742.json"; const r = spawnSync(process.execPath, [CLI, marker, "extra"], { encoding: "utf8" }); assert.notEqual(r.status, 0); assert.equal(`${r.stdout}${r.stderr}`.includes(marker), false); assert.throws(() => parseCliArgs([])); });
test("example CLI is nonzero and package script exists", () => { const r = spawnSync(process.execPath, [CLI, EXAMPLE], { encoding: "utf8" }); assert.notEqual(r.status, 0); const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")); assert.equal(pkg.scripts["release:validate"], "node scripts/validate-release-evidence.mjs"); });
