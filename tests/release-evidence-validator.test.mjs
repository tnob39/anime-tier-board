import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { REQUIRED_CHECK_IDS, ValidationError, evaluateReleaseEvidence, loadAndEvaluateEvidenceFile, parseCliArgs, parseEvidenceJson, usageText } from "../scripts/validate-release-evidence.mjs";
import { sha256Hex } from "../scripts/load/capacity-report.mjs";

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

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atb742e-"));
}
function boundFile(dir, name, obj) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, JSON.stringify(obj));
  return { path: name, sha256: sha256Hex(fs.readFileSync(filePath)) };
}
function boundEvidence(dir, { tamper = false, missing = false, testOnly = true } = {}) {
  const x = evidence();
  const payload = (id, extra = {}) => ({
    checkId: id,
    status: "pass",
    commit: SHA,
    testOnly,
    canonicalUrl: "https://anime.example.jp/",
    canonicalUrlVerified: true,
    apiIds: ["auth-session", "shares-list"],
    healthVerified: true,
    errorMonitoringVerified: true,
    restoreTarget: "disposable",
    restoreResult: "pass",
    integrityResult: "pass",
    rollbackResult: "pass",
    ...extra,
  });
  x.monitoring.dashboardRef = boundFile(dir, "dashboard.json", { kind: "dashboard", testOnly });
  x.monitoring.alertDestinationRef = boundFile(dir, "alert.json", { kind: "alert", testOnly });
  for (const check of x.checks) {
    check.artifactRef = boundFile(dir, `${check.id}.json`, payload(check.id));
    if (check.id === "guest-journey" || check.id === "auth-journey") {
      check.details.journeyRef = boundFile(dir, `${check.id}-journey.json`, payload(check.id));
    }
    if (check.id === "turso-restore") {
      check.details.backupRef = boundFile(dir, "backup.json", { kind: "turso-backup", commit: SHA, restoreTarget: "disposable", testOnly });
    }
    if (check.id === "vercel-rollback") {
      check.details.rollbackDeploymentRef = boundFile(dir, "rollback.json", { kind: "vercel-rollback", commit: SHA, rollbackResult: "pass", testOnly });
    }
  }
  if (tamper) x.checks[0].artifactRef.sha256 = "0".repeat(64);
  if (missing) x.checks[0].artifactRef.path = "missing-artifact.json";
  return x;
}

test("self-authored artifact:// strings never produce GO", () => {
  const r = evaluateReleaseEvidence(evidence());
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.reasons.includes("unboundEvidence"));
});
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
test("Turso proof requires backup, disposable restore and integrity pass", () => {
  const missing = evidence();
  delete missing.checks.find((c) => c.id === "turso-restore").details.backupRef;
  assert.equal(evaluateReleaseEvidence(missing).decision, "NO_GO");
  for (const key of ["restoreTarget", "restoreResult", "integrityResult"]) {
    const x = evidence();
    x.checks.find((c) => c.id === "turso-restore").details[key] = "fail";
    assert.throws(() => evaluateReleaseEvidence(x), ValidationError);
  }
});
test("Vercel rollback rehearsal requires deployment reference and pass result", () => { const x = evidence(); x.checks.find((c) => c.id === "vercel-rollback").details.rollbackResult = "fail"; assert.throws(() => evaluateReleaseEvidence(x), ValidationError); });
test("blocker values and known issue values are never emitted", () => { const marker = "PRIVATE_ARBITRARY_VALUE_742"; const r = evaluateReleaseEvidence(evidence({ stopBlockers: [marker], knownIssues: [{ id: marker, severity: "security", status: marker }] })); assert.equal(r.decision, "NO_GO"); assert.equal(JSON.stringify(r).includes(marker), false); });
test("CLI never echoes arbitrary values on any validation failure", () => { const marker = "sk-live-PRIVATE-DO-NOT-ECHO"; const x = evidence({ canonicalUrl: marker }); x.stopBlockers = [marker]; const r = cliFile(x); assert.notEqual(r.status, 0); assert.equal(`${r.stdout}${r.stderr}`.includes(marker), false); assert.deepEqual(JSON.parse(r.stdout).reasons, ["validationError"]); });
test("unknown and forbidden field names do not echo attacker-controlled names", () => { const marker = "secretAttackerField742"; const x = evidence(); x[marker] = "value"; const r = cliFile(x); assert.equal(`${r.stdout}${r.stderr}`.includes(marker), false); });
test("CLI argument values and missing paths are never echoed", () => { const marker = "PRIVATE-PATH-742.json"; const r = spawnSync(process.execPath, [CLI, marker, "extra"], { encoding: "utf8" }); assert.notEqual(r.status, 0); assert.equal(`${r.stdout}${r.stderr}`.includes(marker), false); assert.throws(() => parseCliArgs([])); });
test("example CLI is nonzero and package script exists", () => { const r = spawnSync(process.execPath, [CLI, EXAMPLE], { encoding: "utf8" }); assert.notEqual(r.status, 0); const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")); assert.equal(pkg.scripts["release:validate"], "node scripts/validate-release-evidence.mjs"); });

test("bound test-only artifacts remain NO_GO at release decision", () => {
  const dir = tempDir();
  const r = evaluateReleaseEvidence(boundEvidence(dir, { testOnly: true }), {
    trustedOutputRoot: dir,
    workspaceRoot: ROOT,
  });
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.reasons.includes("testOnlyEvidence"));
});

test("artifact prototype keys are rejected and missing capacity task provenance is NO_GO", () => {
  const dir = tempDir();
  const x = boundEvidence(dir);
  x.checks[0].artifactRef = boundFile(
    dir,
    "prototype.json",
    JSON.parse('{"__proto__":{"polluted":true},"checkId":"typecheck","status":"pass","commit":"' + SHA + '","testOnly":false}'),
  );
  const artifactResult = evaluateReleaseEvidence(x, {
    trustedOutputRoot: dir,
    workspaceRoot: ROOT,
  });
  assert.equal(artifactResult.decision, "NO_GO");
  assert.ok(artifactResult.reasons.includes("prototypeKeyRejected"));
  assert.equal({}.polluted, undefined);

  const cap = boundFile(dir, "capacity.json", {
    decision: "GO",
    target: "production",
    testOnly: false,
    provenance: { testOnly: false, targetEnvironment: "production" },
  });
  const capacity = evaluateReleaseEvidence(
    { ...evidence(), capacityReport: cap },
    { trustedOutputRoot: dir, workspaceRoot: ROOT },
  );
  assert.equal(capacity.decision, "NO_GO");
  assert.ok(capacity.reasons.includes("missingTaskId"));
});

test("tampered SHA-256 is NO_GO", () => {
  const dir = tempDir();
  const r = evaluateReleaseEvidence(boundEvidence(dir, { tamper: true }), {
    trustedOutputRoot: dir,
    workspaceRoot: ROOT,
  });
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.reasons.includes("evidenceHashMismatch"));
});

test("missing bound artifact is NO_GO", () => {
  const dir = tempDir();
  const r = evaluateReleaseEvidence(boundEvidence(dir, { missing: true }), {
    trustedOutputRoot: dir,
    workspaceRoot: ROOT,
  });
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.reasons.includes("missingEvidenceArtifact"));
});

test("outside-root artifact path is NO_GO", () => {
  const dir = tempDir();
  const x = boundEvidence(dir);
  x.checks[0].artifactRef = {
    path: "C:\\Windows\\Temp\\atb-742-forged.json",
    sha256: "a".repeat(64),
  };
  const r = evaluateReleaseEvidence(x, { trustedOutputRoot: dir, workspaceRoot: ROOT });
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.reasons.includes("unboundEvidence"));
});

test("junction on evidence path is NO_GO; injected detector when actual link creation is unsupported", () => {
  const dir = tempDir();
  const outside = tempDir();
  const linked = path.join(dir, "linked");
  let created = false;
  try {
    fs.symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
    created = true;
  } catch (err) {
    if (!["EPERM", "EACCES", "ENOTSUP", "EUNKNOWN"].includes(err.code)) throw err;
  }
  const forged = boundFile(outside, "typecheck.json", {
    checkId: "typecheck",
    status: "pass",
    commit: SHA,
    testOnly: true,
  });
  const x = boundEvidence(dir);
  if (created) {
    x.checks[0].artifactRef = { path: path.join(linked, "typecheck.json"), sha256: forged.sha256 };
    const r = evaluateReleaseEvidence(x, { trustedOutputRoot: dir, workspaceRoot: ROOT });
    assert.equal(r.decision, "NO_GO");
    assert.ok(r.reasons.includes("unboundEvidence") || r.reasons.includes("missingEvidenceArtifact"));
    return;
  }
  assert.equal(created, false);
  fs.mkdirSync(linked, { recursive: true });
  x.checks[0].artifactRef = { path: path.join(linked, "typecheck.json"), sha256: forged.sha256 };
  const r = evaluateReleaseEvidence(x, {
    trustedOutputRoot: dir,
    workspaceRoot: ROOT,
    isLinkOrReparse: (p) => p === linked || (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()),
  });
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.reasons.includes("unboundEvidence") || r.reasons.includes("missingEvidenceArtifact"));
});

test("duplicate object keys in release evidence JSON are rejected", () => {
  assert.throws(() => parseEvidenceJson('{"releaseCommit":"a","releaseCommit":"b"}'), ValidationError);
  assert.throws(() => parseEvidenceJson('{"a":{"b":1,"b":2}}'), ValidationError);
  assert.throws(() => parseEvidenceJson('{"\\u0061":1,"a":2}'), ValidationError);
});

test("CLI documents trusted commit/environment/freshness and never uses evidence as expected", () => {
  const help = usageText();
  assert.match(help, /--expected-commit/);
  assert.match(help, /ATB_EXPECTED_COMMIT|GITHUB_SHA|git rev-parse HEAD/);
  assert.match(help, /never/i);
  assert.match(help, /releaseCommit/);
  const parsed = parseCliArgs(["evidence.json", "--expected-commit", "a".repeat(40), "--generated-at-max-age-seconds", "60"]);
  assert.equal(parsed.mode, "validate");
  assert.equal(parsed.trusted.expectedCommit, "a".repeat(40));
  assert.equal(parsed.trusted.generatedAtMaxAgeSeconds, 60);
  const signerParsed = parseCliArgs([
    "evidence.json",
    "--production-key-id",
    "prod-1",
    "--production-public-key-pem",
    "PEM",
  ]);
  assert.equal(signerParsed.trusted.productionKeyId, "prod-1");
  assert.equal(signerParsed.trusted.productionPublicKeyPem, "PEM");
});
