import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  canonicalJson,
  generateTestEd25519,
  exportPublicKeyPem,
  signCanonical,
  manifestDigest,
  canonicalizeEvidencePath,
  verifyDetachedManifest,
  productionVerifier,
  evaluateSignedManifest,
  validateSignatureWrapper,
  validateManifestSchema,
  resolveExternalProductionTrustAnchor,
} from "../scripts/load/signed-provenance.mjs";
import { parseJsonStrict, isPlainOwnDataObject } from "../scripts/load/strict-json.mjs";
import { evaluateReleaseEvidence } from "../scripts/validate-release-evidence.mjs";
import { evaluateCapacity, loadCatalog, loadBoundJson, sha256Hex } from "../scripts/load/capacity-report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "ac00b96207bc8cb3a6a98dac6e306a7bca6ff4a5";
const OTHER_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const GEN_AT = "2026-09-21T00:00:00Z";
const NOW = Date.parse("2026-09-21T00:00:30Z");
const MAX_AGE = 3_600_000;

function signedOpts(extra = {}) {
  return {
    expectedCommit: SHA,
    expectedEnvironment: "production",
    now: NOW,
    generatedAtMaxAgeMs: MAX_AGE,
    ...extra,
  };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atb745sig-"));
}

function writeBound(dir, name, obj) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, JSON.stringify(obj));
  return { path: name, sha256: sha256Hex(fs.readFileSync(filePath)) };
}

test("repository production signer is unprovisioned so capacity and release stay NO_GO", () => {
  const signer = productionVerifier(ROOT);
  assert.equal(signer.ok, false);
  assert.equal(signer.reason, "missingProductionSigner");
  const { catalog } = loadCatalog(path.join(ROOT, "docs", "release", "capacity-limits.catalog.json"));
  const cap = evaluateCapacity({ catalog, pathOpts: { workspaceRoot: ROOT } });
  assert.equal(cap.decision, "NO_GO");
  assert.ok(cap.reasons.includes("missingProductionSigner"));
});

test("repository signing policy cannot replace the external production trust anchor", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "docs", "release"), { recursive: true });
  const honest = generateTestEd25519();
  const attacker = generateTestEd25519();
  fs.writeFileSync(path.join(dir, "docs", "release", "signing-policy.json"), JSON.stringify({
    schemaVersion: 1,
    status: "provisioned",
    algorithm: "Ed25519",
    production: { keyId: "attacker", publicKeyPem: exportPublicKeyPem(attacker.publicKey) },
  }));
  const result = productionVerifier(dir, {
    keyId: "honest",
    publicKeyPem: exportPublicKeyPem(honest.publicKey),
  });
  assert.deepEqual(result, { ok: false, reason: "missingProductionSigner" });
  assert.equal(
    verifyDetachedManifest({
      manifest: baseManifest(),
      signature: {
        algorithm: "Ed25519",
        keyId: "attacker",
        signature: signCanonical(attacker.privateKey, canonicalJson(baseManifest())),
        manifestSha256: manifestDigest(baseManifest()),
      },
      publicKeyPem: exportPublicKeyPem(attacker.publicKey),
      expectedKeyId: "attacker",
    }).ok,
    true,
  );
});

test("malformed policy and external trust anchors return missingProductionSigner without throwing", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "docs", "release"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "release", "signing-policy.json"), "{malformed");
  assert.doesNotThrow(() => productionVerifier(dir, { keyId: "x", publicKeyPem: "not-a-key" }));
  assert.deepEqual(
    productionVerifier(dir, { keyId: "x", publicKeyPem: "not-a-key" }),
    { ok: false, reason: "missingProductionSigner" },
  );
  assert.deepEqual(
    resolveExternalProductionTrustAnchor({ productionTrustAnchor: Object.create({ keyId: "x", publicKeyPem: "x" }) }),
    { ok: false, reason: "missingProductionSigner" },
  );
  const release = {
    releaseCommit: SHA,
    executedAt: GEN_AT,
    canonicalUrl: "https://anime.example.jp/",
    operator: "x",
    monitoring: {
      dashboardRef: "monitor://x",
      alertDestinationRef: "alert://x",
      errorBudget: "99.9%",
      owner: "team",
      onCallSlaMinutes: 15,
    },
    checks: [],
    stopBlockers: [],
    knownIssues: [],
  };
  assert.doesNotThrow(() => evaluateReleaseEvidence(release, {
    workspaceRoot: dir,
    productionTrustAnchor: Object.create({ keyId: "x", publicKeyPem: "x" }),
  }));
  const releaseResult = evaluateReleaseEvidence(release, {
    workspaceRoot: dir,
    productionTrustAnchor: Object.create({ keyId: "x", publicKeyPem: "x" }),
  });
  assert.equal(releaseResult.decision, "NO_GO");
  assert.ok(releaseResult.reasons.includes("missingProductionSigner"));
});

test("imported signature, capacity, and release APIs reject inherited fields", () => {
  const inheritedSignature = Object.create({
    algorithm: "Ed25519",
    keyId: "x",
    signature: "x",
    manifestSha256: "a".repeat(64),
  });
  assert.equal(validateSignatureWrapper(inheritedSignature).ok, false);
  assert.equal(isPlainOwnDataObject(inheritedSignature), false);
  const inheritedManifest = Object.create(baseManifest());
  assert.equal(validateManifestSchema(inheritedManifest, signedOpts()).ok, false);

  const { catalog } = loadCatalog(path.join(ROOT, "docs", "release", "capacity-limits.catalog.json"));
  const inheritedCatalog = Object.create(catalog);
  const capacity = evaluateCapacity({ catalog: inheritedCatalog });
  assert.equal(capacity.decision, "NO_GO");

  const inheritedRelease = Object.create({
    releaseCommit: SHA,
    executedAt: GEN_AT,
    canonicalUrl: "https://anime.example.jp/",
    operator: "x",
    monitoring: {},
    checks: [],
  });
  assert.throws(() => evaluateReleaseEvidence(inheritedRelease));
});

test("case-alias evidence path cannot bind a differently cased physical file", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "evidence"), { recursive: true });
  const file = path.join(dir, "evidence", "cap.json");
  fs.writeFileSync(file, JSON.stringify({ ok: true }));
  const spec = { path: "Evidence/cap.json", sha256: sha256Hex(fs.readFileSync(file)) };
  const result = loadBoundJson(spec, { workspaceRoot: ROOT, trustedOutputRoot: dir }, "evidence");
  assert.equal(result.ok, false);
  assert.ok(
    result.reason === "evidencePathCaseMismatch" ||
      result.reason === "missingEvidenceArtifact",
  );
});

test("test Ed25519 keys can sign a manifest but cannot authorize release GO", () => {
  const dir = tempDir();
  const { publicKey, privateKey } = generateTestEd25519();
  const pem = exportPublicKeyPem(publicKey);
  const manifest = {
    schemaVersion: 1,
    targetEnvironment: "production",
    commit: SHA,
    generatedAt: "2026-09-21T00:00:00Z",
    capacityDecision: "GO",
    taskId: "ATB-745-P0-CAPACITY",
    evidence: [{ path: "capacity.json", sha256: "a".repeat(64), semanticType: "capacity-report" }],
  };
  const canonical = canonicalJson(manifest);
  const signature = {
    algorithm: "Ed25519",
    keyId: "test-only",
    signature: signCanonical(privateKey, canonical),
    manifestSha256: manifestDigest(manifest),
  };
  const ok = verifyDetachedManifest({
    manifest,
    signature,
    publicKeyPem: pem,
    expectedKeyId: "test-only",
  });
  assert.equal(ok.ok, true);

  const manSpec = writeBound(dir, "manifest.json", manifest);
  const sigSpec = writeBound(dir, "signature.json", signature);
  const signed = evaluateSignedManifest({
    manifestSpec: manSpec,
    signatureSpec: sigSpec,
    pathOpts: { trustedOutputRoot: dir, workspaceRoot: ROOT },
    publicKeyPem: pem,
    expectedKeyId: "test-only",
    ...signedOpts(),
  });
  assert.equal(signed.ok, true);

  const release = evaluateReleaseEvidence(
    {
      releaseCommit: SHA,
      executedAt: "2026-09-21T00:00:00Z",
      canonicalUrl: "https://anime.example.jp/",
      operator: "x",
      monitoring: {
        dashboardRef: "monitor://x",
        alertDestinationRef: "alert://x",
        errorBudget: "99.9%",
        owner: "team",
        onCallSlaMinutes: 15,
      },
      checks: [],
      stopBlockers: [],
      knownIssues: [],
      signedManifest: manSpec,
      detachedSignature: sigSpec,
    },
    { trustedOutputRoot: dir, workspaceRoot: ROOT },
  );
  assert.equal(release.decision, "NO_GO");
  assert.ok(release.reasons.includes("missingProductionSigner"));
});

test("unsigned, attacker-key, tampered, stale commit and wrong environment fail closed", () => {
  const dir = tempDir();
  const honest = generateTestEd25519();
  const attacker = generateTestEd25519();
  const manifest = {
    schemaVersion: 1,
    targetEnvironment: "production",
    commit: SHA,
    generatedAt: "2026-09-21T00:00:00Z",
    capacityDecision: "GO",
    taskId: "ATB-745-P0-CAPACITY",
    evidence: [],
  };
  const canonical = canonicalJson(manifest);
  const honestSig = {
    algorithm: "Ed25519",
    keyId: "honest",
    signature: signCanonical(honest.privateKey, canonical),
    manifestSha256: manifestDigest(manifest),
  };
  const pem = exportPublicKeyPem(honest.publicKey);

  assert.equal(
    verifyDetachedManifest({
      manifest,
      signature: { ...honestSig, signature: signCanonical(attacker.privateKey, canonical) },
      publicKeyPem: pem,
      expectedKeyId: "honest",
    }).ok,
    false,
  );

  const tampered = { ...manifest, capacityDecision: "NO_GO" };
  assert.equal(
    verifyDetachedManifest({
      manifest: tampered,
      signature: honestSig,
      publicKeyPem: pem,
      expectedKeyId: "honest",
    }).ok,
    false,
  );

  const stale = writeBound(dir, "stale.json", { ...manifest, commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
  const sigSpec = writeBound(dir, "sig.json", honestSig);
  const staleEval = evaluateSignedManifest({
    manifestSpec: stale,
    signatureSpec: sigSpec,
    pathOpts: { trustedOutputRoot: dir, workspaceRoot: ROOT },
    publicKeyPem: pem,
    expectedKeyId: "honest",
    ...signedOpts(),
  });
  assert.equal(staleEval.ok, false);

  const env = writeBound(dir, "env.json", { ...manifest, targetEnvironment: "test" });
  const envSig = {
    algorithm: "Ed25519",
    keyId: "honest",
    signature: signCanonical(honest.privateKey, canonicalJson({ ...manifest, targetEnvironment: "test" })),
    manifestSha256: manifestDigest({ ...manifest, targetEnvironment: "test" }),
  };
  const envSigSpec = writeBound(dir, "env-sig.json", envSig);
  const envEval = evaluateSignedManifest({
    manifestSpec: env,
    signatureSpec: envSigSpec,
    pathOpts: { trustedOutputRoot: dir, workspaceRoot: ROOT },
    publicKeyPem: pem,
    expectedKeyId: "honest",
    ...signedOpts(),
  });
  assert.equal(envEval.ok, false);
  assert.equal(envEval.reason, "wrongEnvironment");

  const unsigned = evaluateReleaseEvidence(
    {
      releaseCommit: SHA,
      executedAt: "2026-09-21T00:00:00Z",
      canonicalUrl: "https://anime.example.jp/",
      operator: "x",
      monitoring: {
        dashboardRef: "monitor://x",
        alertDestinationRef: "alert://x",
        errorBudget: "99.9%",
        owner: "team",
        onCallSlaMinutes: 15,
      },
      checks: [],
      stopBlockers: [],
      knownIssues: [],
    },
    { workspaceRoot: ROOT },
  );
  assert.equal(unsigned.decision, "NO_GO");
  assert.ok(unsigned.reasons.includes("missingSignedProvenance"));
  assert.ok(unsigned.reasons.includes("missingProductionSigner"));
  assert.ok(unsigned.reasons.includes("missingTrustedCommit"));
});

function baseManifest(over = {}) {
  return {
    schemaVersion: 1,
    targetEnvironment: "production",
    commit: SHA,
    generatedAt: GEN_AT,
    capacityDecision: "GO",
    taskId: "ATB-745-P0-CAPACITY",
    evidence: [],
    ...over,
  };
}

test("strict manifest schema rejects extra fields, missing generatedAt, bad types", () => {
  const schemaOpts = signedOpts();
  assert.equal(validateManifestSchema({ ...baseManifest(), extra: true }, schemaOpts).reason, "invalidManifestSchema");
  const missing = baseManifest();
  delete missing.generatedAt;
  assert.equal(validateManifestSchema(missing, schemaOpts).reason, "invalidManifestSchema");
  assert.equal(
    validateManifestSchema(baseManifest({ schemaVersion: "1" }), schemaOpts).reason,
    "tamperedManifest",
  );
  assert.equal(
    validateManifestSchema(
      baseManifest({
        evidence: [{ path: "a", sha256: "a".repeat(64), semanticType: "capacity-report", extra: 1 }],
      }),
      schemaOpts,
    ).reason,
    "invalidManifestSchema",
  );
});

test("generatedAt must be UTC and within trusted freshness", () => {
  const schemaOpts = signedOpts();
  assert.equal(
    validateManifestSchema(baseManifest({ generatedAt: "2026-09-21T00:00:00+00:00" }), schemaOpts).reason,
    "invalidManifestSchema",
  );
  assert.equal(
    validateManifestSchema(baseManifest({ generatedAt: "2026-09-20T00:00:00Z" }), schemaOpts).reason,
    "staleGeneratedAt",
  );
  assert.equal(
    validateManifestSchema(baseManifest({ generatedAt: "2026-09-21T00:10:00Z" }), schemaOpts).reason,
    "generatedAtInFuture",
  );
  assert.equal(validateManifestSchema(baseManifest(), { ...schemaOpts, generatedAtMaxAgeMs: undefined }).reason, "missingFreshnessPolicy");
});

test("evidence entries are unique normalized path/hash/type; missing extra duplicate and semantic mismatch fail", () => {
  const cap = { path: "evidence/cap.json", sha256: "a".repeat(64), semanticType: "capacity-report" };
  const ok = baseManifest({
    evidence: [{ path: "evidence/cap.json", sha256: "A".repeat(64), semanticType: "capacity-report" }],
  });
  assert.equal(
    validateManifestSchema(ok, signedOpts({ requiredEvidence: [cap] })).ok,
    true,
  );
  assert.equal(
    validateManifestSchema(
      baseManifest({
        evidence: [
          { path: "a.json", sha256: "a".repeat(64), semanticType: "capacity-report" },
          { path: "a.json", sha256: "b".repeat(64), semanticType: "release-check" },
        ],
      }),
      signedOpts(),
    ).reason,
    "duplicateEvidencePath",
  );
  assert.equal(
    validateManifestSchema(baseManifest({ evidence: [] }), signedOpts({
      requiredEvidence: [{ path: "cap.json", sha256: "a".repeat(64), semanticType: "capacity-report" }],
    })).reason,
    "missingManifestEvidence",
  );
  assert.equal(
    validateManifestSchema(
      baseManifest({
        evidence: [{ path: "extra.json", sha256: "a".repeat(64), semanticType: "release-check" }],
      }),
      signedOpts({ requiredEvidence: [] }),
    ).reason,
    "extraManifestEvidence",
  );
  assert.equal(
    validateManifestSchema(
      baseManifest({
        evidence: [{ path: "cap.json", sha256: "a".repeat(64), semanticType: "release-check" }],
      }),
      signedOpts({
        requiredEvidence: [{ path: "cap.json", sha256: "a".repeat(64), semanticType: "capacity-report" }],
      }),
    ).reason,
    "semanticMismatch",
  );
  assert.equal(
    validateManifestSchema(
      baseManifest({
        evidence: [{ path: "cap.json", sha256: "b".repeat(64), semanticType: "capacity-report" }],
      }),
      signedOpts({
        requiredEvidence: [{ path: "cap.json", sha256: "a".repeat(64), semanticType: "capacity-report" }],
      }),
    ).reason,
    "evidenceHashMismatch",
  );
});

test("evidence paths reject traversal, dot segments, mixed separators, and case aliases", () => {
  for (const value of [
    "../cap.json",
    "./cap.json",
    "evidence/../cap.json",
    "evidence/./cap.json",
    "evidence\\cap.json",
    "evidence/\\cap.json",
    "C:/evidence/cap.json",
    "C:\\evidence\\cap.json",
  ]) {
    assert.equal(canonicalizeEvidencePath(value).ok, false, value);
  }
  const result = validateManifestSchema(
    baseManifest({
      evidence: [
        { path: "Evidence/cap.json", sha256: "a".repeat(64), semanticType: "capacity-report" },
        { path: "evidence/cap.json", sha256: "b".repeat(64), semanticType: "release-check" },
      ],
    }),
    signedOpts(),
  );
  assert.equal(result.reason, "duplicateEvidencePath");
});

test("manifest and signature __proto__ keys are rejected as extra fields", () => {
  const manifest = parseJsonStrict(
    `{"__proto__":{},"schemaVersion":1,"targetEnvironment":"production","commit":"${SHA}","generatedAt":"${GEN_AT}","capacityDecision":"GO","taskId":"ATB-745-P0-CAPACITY","evidence":[]}`,
  );
  assert.equal(validateManifestSchema(manifest, signedOpts()).reason, "invalidManifestSchema");
  const signature = parseJsonStrict(
    `{"__proto__":{},"algorithm":"Ed25519","keyId":"x","signature":"x","manifestSha256":"${"a".repeat(64)}"}`,
  );
  assert.equal(validateSignatureWrapper(signature).reason, "invalidManifestSchema");
  assert.equal({}.polluted, undefined);
});

test("evaluateSignedManifest does not treat missing expectedCommit as evidence self-check", () => {
  const dir = tempDir();
  const keys = generateTestEd25519();
  const pem = exportPublicKeyPem(keys.publicKey);
  const manifest = baseManifest();
  const signature = {
    algorithm: "Ed25519",
    keyId: "honest",
    signature: signCanonical(keys.privateKey, canonicalJson(manifest)),
    manifestSha256: manifestDigest(manifest),
  };
  const manSpec = writeBound(dir, "man.json", manifest);
  const sigSpec = writeBound(dir, "sig.json", signature);
  const missing = evaluateSignedManifest({
    manifestSpec: manSpec,
    signatureSpec: sigSpec,
    pathOpts: { trustedOutputRoot: dir, workspaceRoot: ROOT },
    publicKeyPem: pem,
    expectedKeyId: "honest",
    now: NOW,
    generatedAtMaxAgeMs: MAX_AGE,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "missingTrustedCommit");

  const replay = evaluateSignedManifest({
    manifestSpec: manSpec,
    signatureSpec: sigSpec,
    pathOpts: { trustedOutputRoot: dir, workspaceRoot: ROOT },
    publicKeyPem: pem,
    expectedKeyId: "honest",
    ...signedOpts({ expectedCommit: OTHER_SHA }),
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "staleOrWrongCommit");
});

test("signed historical GO for wrong commit is NO_GO even if evidence.releaseCommit matches the old SHA", () => {
  const dir = tempDir();
  const keys = generateTestEd25519();
  const pem = exportPublicKeyPem(keys.publicKey);
  const manifest = baseManifest();
  const signature = {
    algorithm: "Ed25519",
    keyId: "honest",
    signature: signCanonical(keys.privateKey, canonicalJson(manifest)),
    manifestSha256: manifestDigest(manifest),
  };
  const manSpec = writeBound(dir, "man.json", manifest);
  const sigSpec = writeBound(dir, "sig.json", signature);
  const release = evaluateReleaseEvidence(
    {
      releaseCommit: SHA,
      executedAt: GEN_AT,
      canonicalUrl: "https://anime.example.jp/",
      operator: "x",
      monitoring: {
        dashboardRef: "monitor://x",
        alertDestinationRef: "alert://x",
        errorBudget: "99.9%",
        owner: "team",
        onCallSlaMinutes: 15,
      },
      checks: [],
      stopBlockers: [],
      knownIssues: [],
      signedManifest: manSpec,
      detachedSignature: sigSpec,
    },
    {
      workspaceRoot: ROOT,
      trustedOutputRoot: dir,
      trustedExpectedCommit: OTHER_SHA,
      trustedExpectedEnvironment: "production",
      generatedAtMaxAgeMs: MAX_AGE,
      now: NOW,
    },
  );
  assert.equal(release.decision, "NO_GO");
  assert.ok(release.reasons.includes("staleOrWrongCommit"));
  assert.ok(release.reasons.includes("missingProductionSigner"));
});

test("evaluateCapacity truthy signedManifest paths are not an unsigned GO path", () => {
  const { catalog } = loadCatalog(path.join(ROOT, "docs", "release", "capacity-limits.catalog.json"));
  const cap = evaluateCapacity({
    catalog,
    pathOpts: {
      workspaceRoot: ROOT,
      signedManifest: "manifest.json",
      detachedSignature: "signature.json",
      trustedExpectedCommit: SHA,
      generatedAtMaxAgeMs: MAX_AGE,
      now: NOW,
    },
  });
  assert.equal(cap.decision, "NO_GO");
  assert.ok(cap.reasons.includes("missingSignedProvenance"));
  assert.ok(cap.reasons.includes("missingProductionSigner"));
});
