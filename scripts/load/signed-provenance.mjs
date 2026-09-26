/**
 * Detached Ed25519 provenance. SHA-256 binds bytes; this module binds identity.
 * Production verification requires an externally supplied trust anchor and
 * checks the repository policy against that anchor; repository policy alone is
 * never a trust root because a release commit can replace it.
 * Manifest schema is an exact allowlist. Replay uses trusted commit/env/freshness
 * supplied by CI/CLI/HEAD — never evidence.releaseCommit as its own expected value.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  WORKSPACE_ROOT,
  hasExactPathSpelling,
  posixRelativeFromRoot,
  resolveSafePath,
} from "./safe-path.mjs";
import {
  parseJsonBytesStrict,
  parseJsonStrict,
  StrictJsonError,
  hasPrototypePollutionKey,
  isPlainOwnDataObject,
  ownDataValue,
} from "./strict-json.mjs";

export { parseJsonStrict, parseJsonBytesStrict, StrictJsonError, hasPrototypePollutionKey };

export function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export const MANIFEST_SCHEMA_VERSION = 1;
export const SIGNING_POLICY_REL = path.join("docs", "release", "signing-policy.json");
export const COMMIT_RE = /^[0-9a-f]{40}$/;
export const SHA256_RE = /^[a-f0-9]{64}$/;
export const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
export const DEFAULT_GENERATED_AT_MAX_AGE_MS = 60 * 60 * 1000;
export const GENERATED_AT_FUTURE_SKEW_MS = 60 * 1000;

export const MANIFEST_KEYS = Object.freeze([
  "schemaVersion",
  "targetEnvironment",
  "commit",
  "generatedAt",
  "capacityDecision",
  "taskId",
  "evidence",
]);
export const EVIDENCE_ENTRY_KEYS = Object.freeze(["path", "sha256", "semanticType"]);
export const SIGNATURE_KEYS = Object.freeze(["algorithm", "keyId", "signature", "manifestSha256"]);
export const SEMANTIC_TYPES = Object.freeze([
  "capacity-report",
  "release-check",
  "journey",
  "dashboard",
  "alert",
  "turso-backup",
  "vercel-rollback",
  "catalog",
  "read-harness",
  "write-harness",
  "production-smoke",
  "proven-limit",
]);

const plain = isPlainOwnDataObject;

function isBoundSpec(item) {
  return Boolean(
    item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      canonicalizeEvidencePath(ownDataValue(item, "path")).ok &&
      SHA256_RE.test(String(ownDataValue(item, "sha256") || "").toLowerCase()),
  );
}

/**
 * Platform-independent canonical relative POSIX path for evidence entries.
 * Rejects absolute/drive/UNC, backslashes, empty, dot/dotdot, repeated/trailing
 * separators, percent-encoding and non-ASCII tricks. Exact path is preserved;
 * case-fold collisions are rejected separately.
 */
export function canonicalizeEvidencePath(raw) {
  if (typeof raw !== "string" || raw === "") {
    return { ok: false, reason: "invalidEvidencePath" };
  }
  if (raw.trim() !== raw) return { ok: false, reason: "invalidEvidencePath" };
  if (raw.includes("\0") || raw.includes("%") || raw.includes("\\")) {
    return { ok: false, reason: "invalidEvidencePath" };
  }
  if (/^[a-zA-Z]:/.test(raw) || raw.startsWith("/") || raw.startsWith("//")) {
    return { ok: false, reason: "invalidEvidencePath" };
  }
  if (raw.endsWith("/") || raw.includes("//")) return { ok: false, reason: "invalidEvidencePath" };
  if (!/^[A-Za-z0-9._/-]+$/.test(raw)) return { ok: false, reason: "invalidEvidencePath" };
  const parts = raw.split("/");
  if (parts.length === 0 || parts.some((s) => s === "" || s === "." || s === "..")) {
    return { ok: false, reason: "invalidEvidencePath" };
  }
  return { ok: true, path: raw };
}

export function normalizeEvidencePath(p) {
  const canon = canonicalizeEvidencePath(p);
  return canon.ok ? canon.path : "";
}

export function normalizeEvidenceEntry(entry) {
  return {
    path: normalizeEvidencePath(ownDataValue(entry, "path")),
    sha256: String(ownDataValue(entry, "sha256") || "").toLowerCase(),
    semanticType: String(ownDataValue(entry, "semanticType") || ""),
  };
}

export function evidenceEntryKey(entry) {
  const n = normalizeEvidenceEntry(entry);
  return `${n.path}\0${n.sha256}\0${n.semanticType}`;
}

function evidenceCompareRoot(pathOpts = {}, role = "evidence") {
  const trustedOutputRoot = ownDataValue(pathOpts, "trustedOutputRoot");
  if (trustedOutputRoot) return path.resolve(trustedOutputRoot);
  const ws = path.resolve(ownDataValue(pathOpts, "workspaceRoot") ?? WORKSPACE_ROOT);
  if (role === "catalog") return ws;
  if (role === "evidence") return path.join(ws, "artifacts", "evidence");
  return path.join(ws, "artifacts", "load");
}

function loadBound(spec, pathOpts, role) {
  const canon = canonicalizeEvidencePath(ownDataValue(spec, "path"));
  if (!isBoundSpec(spec) || !canon.ok) return { ok: false, reason: "missingSignedProvenance" };
  try {
    const resolved = resolveSafePath(canon.path, { ...pathOpts, role });
    const root = evidenceCompareRoot(pathOpts, role);
    const rel = posixRelativeFromRoot(root, resolved);
    if (rel !== canon.path) return { ok: false, reason: "unboundEvidence" };
    if (!fs.existsSync(resolved)) return { ok: false, reason: "missingEvidenceArtifact" };
    if (!hasExactPathSpelling(root, resolved)) return { ok: false, reason: "evidencePathCaseMismatch" };
    const bytes = fs.readFileSync(resolved);
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
    if (hasPrototypePollutionKey(data)) return { ok: false, reason: "prototypeKeyRejected" };
    return { ok: true, data, sha256: digest, resolved };
  } catch {
    return { ok: false, reason: "unboundEvidence" };
  }
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export function loadSigningPolicy(workspaceRoot = WORKSPACE_ROOT) {
  const resolved = resolveSafePath(SIGNING_POLICY_REL, {
    workspaceRoot,
    role: "catalog",
  });
  const bytes = fs.readFileSync(resolved);
  const policy = parseJsonBytesStrict(bytes, "signing-policy");
  return { policy, resolved };
}

function validEd25519PublicKey(publicKeyPem) {
  if (typeof publicKeyPem !== "string" || !publicKeyPem.includes("BEGIN PUBLIC KEY")) return false;
  try {
    return crypto.createPublicKey(publicKeyPem).asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}

export function resolveExternalProductionTrustAnchor(options = {}, env = process.env) {
  const supplied = ownDataValue(options, "productionTrustAnchor");
  const keyId = supplied !== undefined
    ? ownDataValue(supplied, "keyId")
    : ownDataValue(options, "allowEnv") === true
      ? ownDataValue(options, "productionKeyId") ?? env.ATB_PRODUCTION_KEY_ID ?? env.ATB_PRODUCTION_SIGNING_KEY_ID ?? env.ATB_TRUSTED_PRODUCTION_KEY_ID
      : undefined;
  const publicKeyPem = supplied !== undefined
    ? ownDataValue(supplied, "publicKeyPem")
    : ownDataValue(options, "allowEnv") === true
      ? ownDataValue(options, "productionPublicKeyPem") ?? env.ATB_PRODUCTION_PUBLIC_KEY_PEM ?? env.ATB_PRODUCTION_SIGNING_PUBLIC_KEY_PEM ?? env.ATB_TRUSTED_PRODUCTION_PUBLIC_KEY_PEM
      : undefined;
  if (
    (supplied !== undefined && !plain(supplied)) ||
    typeof keyId !== "string" ||
    !keyId.trim() ||
    !validEd25519PublicKey(publicKeyPem)
  ) {
    return { ok: false, reason: "missingProductionSigner" };
  }
  return { ok: true, anchor: { keyId, publicKeyPem, algorithm: "Ed25519" } };
}

export function productionVerifier(workspaceRoot = WORKSPACE_ROOT, externalTrustAnchor) {
  const external = resolveExternalProductionTrustAnchor({ productionTrustAnchor: externalTrustAnchor });
  if (!external.ok) return external;
  try {
    const { policy } = loadSigningPolicy(workspaceRoot);
    if (!plain(policy) || hasPrototypePollutionKey(policy)) return { ok: false, reason: "missingProductionSigner" };
    const production = ownDataValue(policy, "production");
    const pem = ownDataValue(production, "publicKeyPem");
    const keyId = ownDataValue(production, "keyId");
    if (
      ownDataValue(policy, "status") !== "provisioned" ||
      ownDataValue(policy, "algorithm") !== "Ed25519" ||
      !plain(production) ||
      typeof pem !== "string" ||
      typeof keyId !== "string" ||
      !keyId.trim() ||
      !validEd25519PublicKey(pem) ||
      keyId !== external.anchor.keyId ||
      pem !== external.anchor.publicKeyPem
    ) {
      return { ok: false, reason: "missingProductionSigner" };
    }
    return { ok: true, publicKeyPem: external.anchor.publicKeyPem, keyId: external.anchor.keyId, algorithm: "Ed25519" };
  } catch {
    return { ok: false, reason: "missingProductionSigner" };
  }
}

export function signCanonical(privateKey, canonicalUtf8) {
  return crypto.sign(null, Buffer.from(canonicalUtf8, "utf8"), privateKey).toString("base64");
}

export function verifyCanonical(publicKeyPem, canonicalUtf8, signatureB64) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(
      null,
      Buffer.from(canonicalUtf8, "utf8"),
      key,
      Buffer.from(String(signatureB64), "base64"),
    );
  } catch {
    return false;
  }
}

export function manifestDigest(manifest) {
  return sha256Hex(Buffer.from(canonicalJson(manifest), "utf8"));
}

function extraKeys(obj, allowed) {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

export function validateSignatureWrapper(signature) {
  if (!plain(signature)) return { ok: false, reason: "missingSignedProvenance" };
  if (extraKeys(signature, SIGNATURE_KEYS).length) return { ok: false, reason: "invalidManifestSchema" };
  if (hasPrototypePollutionKey(signature)) return { ok: false, reason: "prototypeKeyRejected" };
  for (const key of SIGNATURE_KEYS) {
    const value = ownDataValue(signature, key);
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, reason: "invalidManifestSchema" };
    }
  }
  if (ownDataValue(signature, "algorithm") !== "Ed25519") return { ok: false, reason: "untrustedSigningKey" };
  if (!SHA256_RE.test(ownDataValue(signature, "manifestSha256").toLowerCase())) {
    return { ok: false, reason: "invalidManifestSchema" };
  }
  return { ok: true };
}

export function assertGeneratedAtFresh(generatedAt, { now = Date.now(), maxAgeMs, futureSkewMs = GENERATED_AT_FUTURE_SKEW_MS } = {}) {
  if (typeof generatedAt !== "string" || !ISO_UTC_RE.test(generatedAt) || Number.isNaN(Date.parse(generatedAt))) {
    return { ok: false, reason: "invalidManifestSchema" };
  }
  if (typeof maxAgeMs !== "number" || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return { ok: false, reason: "missingFreshnessPolicy" };
  }
  const t = Date.parse(generatedAt);
  if (t > now + futureSkewMs) return { ok: false, reason: "generatedAtInFuture" };
  if (now - t > maxAgeMs) return { ok: false, reason: "staleGeneratedAt" };
  return { ok: true };
}

export function validateManifestSchema(manifest, {
  expectedCommit,
  expectedEnvironment = "production",
  now = Date.now(),
  generatedAtMaxAgeMs,
  requiredEvidence,
} = {}) {
  if (!plain(manifest)) return { ok: false, reason: "tamperedManifest" };
  if (extraKeys(manifest, MANIFEST_KEYS).length) return { ok: false, reason: "invalidManifestSchema" };
  if (hasPrototypePollutionKey(manifest)) return { ok: false, reason: "prototypeKeyRejected" };
  for (const key of MANIFEST_KEYS) {
    if (!Object.hasOwn(manifest, key)) {
      return { ok: false, reason: "invalidManifestSchema" };
    }
  }
  if (ownDataValue(manifest, "schemaVersion") !== MANIFEST_SCHEMA_VERSION) return { ok: false, reason: "tamperedManifest" };
  if (typeof ownDataValue(manifest, "targetEnvironment") !== "string" || !ownDataValue(manifest, "targetEnvironment").trim()) {
    return { ok: false, reason: "invalidManifestSchema" };
  }
  if (typeof ownDataValue(manifest, "commit") !== "string" || !COMMIT_RE.test(ownDataValue(manifest, "commit"))) {
    return { ok: false, reason: "invalidManifestSchema" };
  }
  if (typeof ownDataValue(manifest, "taskId") !== "string" || !ownDataValue(manifest, "taskId").trim()) {
    return { ok: false, reason: "missingTaskId" };
  }
  if (ownDataValue(manifest, "capacityDecision") !== "GO" && ownDataValue(manifest, "capacityDecision") !== "NO_GO") {
    return { ok: false, reason: "invalidManifestSchema" };
  }
  if (!Array.isArray(ownDataValue(manifest, "evidence"))) return { ok: false, reason: "invalidManifestSchema" };

  const fresh = assertGeneratedAtFresh(ownDataValue(manifest, "generatedAt"), { now, maxAgeMs: generatedAtMaxAgeMs });
  if (!fresh.ok) return fresh;

  if (!expectedCommit || typeof expectedCommit !== "string" || !COMMIT_RE.test(expectedCommit)) {
    return { ok: false, reason: "missingTrustedCommit" };
  }
  if (ownDataValue(manifest, "commit") !== expectedCommit) return { ok: false, reason: "staleOrWrongCommit" };
  if (ownDataValue(manifest, "targetEnvironment") !== expectedEnvironment) return { ok: false, reason: "wrongEnvironment" };

  const seenPaths = new Set();
  const seenFold = new Set();
  const seenKeys = new Set();
  const normalized = [];
  for (const row of ownDataValue(manifest, "evidence")) {
    if (!plain(row)) return { ok: false, reason: "invalidManifestSchema" };
    if (hasPrototypePollutionKey(row)) return { ok: false, reason: "prototypeKeyRejected" };
    if (extraKeys(row, EVIDENCE_ENTRY_KEYS).length) return { ok: false, reason: "invalidManifestSchema" };
    const canon = canonicalizeEvidencePath(ownDataValue(row, "path"));
    if (!canon.ok) return { ok: false, reason: "invalidEvidencePath" };
    if (typeof ownDataValue(row, "sha256") !== "string" || !SHA256_RE.test(ownDataValue(row, "sha256").toLowerCase())) {
      return { ok: false, reason: "invalidManifestSchema" };
    }
    if (typeof ownDataValue(row, "semanticType") !== "string" || !SEMANTIC_TYPES.includes(ownDataValue(row, "semanticType"))) {
      return { ok: false, reason: "semanticMismatch" };
    }
    const n = normalizeEvidenceEntry({ ...row, path: canon.path });
    if (!n.path) return { ok: false, reason: "invalidEvidencePath" };
    const fold = n.path.toLowerCase();
    if (seenPaths.has(n.path) || seenFold.has(fold)) return { ok: false, reason: "duplicateEvidencePath" };
    seenPaths.add(n.path);
    seenFold.add(fold);
    const key = evidenceEntryKey(n);
    if (seenKeys.has(key)) return { ok: false, reason: "duplicateEvidencePath" };
    seenKeys.add(key);
    normalized.push(n);
  }

  if (Array.isArray(requiredEvidence)) {
    const required = requiredEvidence.map(normalizeEvidenceEntry);
    const requiredPaths = new Set();
    const requiredKeys = new Set();
    for (const r of required) {
      if (!r.path || !SHA256_RE.test(r.sha256) || !SEMANTIC_TYPES.includes(r.semanticType)) {
        return { ok: false, reason: "semanticMismatch" };
      }
      const fold = r.path.toLowerCase();
      if (requiredPaths.has(r.path) || [...requiredPaths].some((p) => p.toLowerCase() === fold)) {
        return { ok: false, reason: "duplicateEvidencePath" };
      }
      requiredPaths.add(r.path);
      requiredKeys.add(evidenceEntryKey(r));
    }
    for (const r of required) {
      if (!seenPaths.has(r.path)) return { ok: false, reason: "missingManifestEvidence" };
      const listed = normalized.find((e) => e.path === r.path);
      if (!listed) return { ok: false, reason: "missingManifestEvidence" };
      if (listed.sha256 !== r.sha256) return { ok: false, reason: "evidenceHashMismatch" };
      if (listed.semanticType !== r.semanticType) return { ok: false, reason: "semanticMismatch" };
    }
    for (const e of normalized) {
      if (!requiredPaths.has(e.path)) return { ok: false, reason: "extraManifestEvidence" };
    }
    if (requiredKeys.size !== seenKeys.size) return { ok: false, reason: "manifestEvidenceMismatch" };
  }

  return { ok: true, evidence: normalized };
}

export function verifyDetachedManifest({ manifest, signature, publicKeyPem, expectedKeyId }) {
  if (!plain(manifest)) return { ok: false, reason: "tamperedManifest" };
  const wrap = validateSignatureWrapper(signature);
  if (!wrap.ok) return wrap;
  if (expectedKeyId && ownDataValue(signature, "keyId") !== expectedKeyId) {
    return { ok: false, reason: "untrustedSigningKey" };
  }
  if (ownDataValue(manifest, "schemaVersion") !== MANIFEST_SCHEMA_VERSION) {
    return { ok: false, reason: "tamperedManifest" };
  }
  const canonical = canonicalJson(manifest);
  const digest = sha256Hex(Buffer.from(canonical, "utf8"));
  if (ownDataValue(signature, "manifestSha256").toLowerCase() !== digest) {
    return { ok: false, reason: "tamperedManifest" };
  }
  if (!verifyCanonical(publicKeyPem, canonical, ownDataValue(signature, "signature"))) {
    return { ok: false, reason: "untrustedSigningKey" };
  }
  return { ok: true, digest };
}

export function evaluateSignedManifest({
  manifestSpec,
  signatureSpec,
  pathOpts,
  expectedCommit,
  expectedEnvironment = "production",
  publicKeyPem,
  expectedKeyId,
  now = Date.now(),
  generatedAtMaxAgeMs,
  requiredEvidence,
}) {
  if (!expectedCommit || typeof expectedCommit !== "string" || !COMMIT_RE.test(expectedCommit)) {
    return { ok: false, reason: "missingTrustedCommit" };
  }
  const man = loadBound(manifestSpec, pathOpts, "evidence");
  if (!man.ok) return { ok: false, reason: man.reason };
  const sig = loadBound(signatureSpec, pathOpts, "evidence");
  if (!sig.ok) return { ok: false, reason: sig.reason };
  const schema = validateManifestSchema(man.data, {
    expectedCommit,
    expectedEnvironment,
    now,
    generatedAtMaxAgeMs,
    requiredEvidence,
  });
  if (!schema.ok) return { ok: false, reason: schema.reason, manifest: man.data, sha256: man.sha256 };
  const verified = verifyDetachedManifest({
    manifest: man.data,
    signature: sig.data,
    publicKeyPem,
    expectedKeyId,
  });
  if (!verified.ok) return verified;
  return {
    ok: true,
    manifest: man.data,
    sha256: man.sha256,
    digest: verified.digest,
    evidence: schema.evidence,
  };
}

export function gitHeadCommit(workspaceRoot = WORKSPACE_ROOT) {
  try {
    const r = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      windowsHide: true,
    });
    if (r.status !== 0) return null;
    const sha = String(r.stdout || "").trim().toLowerCase();
    return COMMIT_RE.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/**
 * Trusted replay policy. Never read expected commit/environment/freshness from
 * submitted evidence JSON. Sources, in order, for CLI only:
 *   expectedCommit: options.expectedCommit → ATB_EXPECTED_COMMIT → GITHUB_SHA → git rev-parse HEAD
 *   expectedEnvironment: options.expectedEnvironment → ATB_EXPECTED_ENVIRONMENT → "production"
 *   generatedAtMaxAgeMs: options.generatedAtMaxAgeMs → ATB_GENERATED_AT_MAX_AGE_SECONDS → CLI default 3600s
 * Programmatic callers must pass expectedCommit and generatedAtMaxAgeMs explicitly;
 * env/HEAD are not implicit for imported APIs (allowEnvHead must be true).
 */
export function resolveTrustedReleasePolicy(options = {}, env = process.env) {
  const allowEnvHead = ownDataValue(options, "allowEnvHead") === true;
  const fromEnvCommit = allowEnvHead
    ? String(env.ATB_EXPECTED_COMMIT || env.GITHUB_SHA || "").trim().toLowerCase()
    : "";
  const expectedCommitOption = ownDataValue(options, "expectedCommit");
  const expectedCommit = COMMIT_RE.test(String(expectedCommitOption || ""))
    ? String(expectedCommitOption).toLowerCase()
    : COMMIT_RE.test(fromEnvCommit)
      ? fromEnvCommit
      : allowEnvHead
        ? gitHeadCommit(ownDataValue(options, "workspaceRoot") ?? WORKSPACE_ROOT)
        : null;

  const envEnv = allowEnvHead ? String(env.ATB_EXPECTED_ENVIRONMENT || "").trim() : "";
  const expectedEnvironment =
    (typeof ownDataValue(options, "expectedEnvironment") === "string" && ownDataValue(options, "expectedEnvironment").trim()) ||
    envEnv ||
    "production";

  let generatedAtMaxAgeMs = ownDataValue(options, "generatedAtMaxAgeMs");
  if (generatedAtMaxAgeMs == null && ownDataValue(options, "generatedAtMaxAgeSeconds") != null) {
    generatedAtMaxAgeMs = Number(ownDataValue(options, "generatedAtMaxAgeSeconds")) * 1000;
  }
  if (generatedAtMaxAgeMs == null && allowEnvHead && env.ATB_GENERATED_AT_MAX_AGE_SECONDS != null) {
    generatedAtMaxAgeMs = Number(env.ATB_GENERATED_AT_MAX_AGE_SECONDS) * 1000;
  }
  if (generatedAtMaxAgeMs == null && allowEnvHead && ownDataValue(options, "cliDefaultMaxAgeMs") != null) {
    generatedAtMaxAgeMs = ownDataValue(options, "cliDefaultMaxAgeMs");
  }

  const optionNow = ownDataValue(options, "now");
  const now = typeof optionNow === "number" && Number.isFinite(optionNow) ? optionNow : Date.now();
  return { expectedCommit, expectedEnvironment, generatedAtMaxAgeMs, now };
}

/** Test-only key generation. Callers must keep private keys in memory. */
export function generateTestEd25519() {
  return crypto.generateKeyPairSync("ed25519");
}

export function exportPublicKeyPem(key) {
  return key.export({ type: "spki", format: "pem" });
}
