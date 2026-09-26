/**
 * ATB-745-P0 — fail-closed path containment.
 * Never realpath a junction/symlink and bless the target as root.
 * lstat every existing component from the anchored root to the destination.
 *
 * Portable post-validation rename TOCTOU is acknowledged and is NOT eliminated.
 * Node/Windows has no renameat beneath an opened directory handle, so
 * production/release evidence writes fail closed unless this runtime provides a
 * capability that this module can prove itself. Caller-supplied rename
 * functions are never trusted.
 * Fixture/test-only reports may use staging-temp rename; that path cannot authorize GO.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SafetyError } from "./safety-error.mjs";

export { SafetyError };

export const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
export const DEFAULT_OUTPUT_DIR = path.join(WORKSPACE_ROOT, "artifacts", "load");
export const DEFAULT_EVIDENCE_DIR = path.join(WORKSPACE_ROOT, "artifacts", "evidence");

const EXTENDED_OR_UNC_RE = /^(?:[\\/]{2}|\\\\\?\\)/;

export function isUserAbsolutePath(userPath) {
  const s = String(userPath);
  if (path.win32.isAbsolute(s) || path.posix.isAbsolute(s)) return true;
  if (/^[a-zA-Z]:[\\/]/.test(s)) return true;
  if (s.startsWith("\\\\") || s.startsWith("//")) return true;
  return false;
}

function normalizeCompare(p) {
  const resolved = path.resolve(p);
  const unified = resolved.replace(/[\\/]+/g, path.sep);
  return process.platform === "win32" ? unified.toLowerCase() : unified;
}

export function isPathInside(root, target) {
  const rootN = normalizeCompare(root);
  const targetN = normalizeCompare(target);
  if (targetN === rootN) return true;
  const prefix = rootN.endsWith(path.sep) ? rootN : rootN + path.sep;
  return targetN.startsWith(prefix);
}

export function posixRelativeFromRoot(root, absPath) {
  const rel = path.relative(path.resolve(root), path.resolve(absPath));
  if (!rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) return null;
  return rel.split(path.sep).join("/");
}

/**
 * Windows resolves paths case-insensitively. Evidence bindings must retain the
 * exact physical spelling so `Evidence/cap.json` cannot bind `evidence/cap.json`.
 * On case-sensitive systems the same check also makes the contract explicit.
 */
export function hasExactPathSpelling(root, absPath, options = {}) {
  const hooks = fsHooks(options);
  const anchored = path.resolve(root);
  const target = path.resolve(absPath);
  if (!isPathInside(anchored, target)) return false;
  const rel = path.relative(anchored, target);
  const parts = rel ? rel.split(/[\\/]+/).filter(Boolean) : [];
  let current = anchored;
  try {
    for (const part of parts) {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      if (!entries.some((entry) => entry.name === part)) return false;
      current = path.join(current, part);
    }
    return true;
  } catch {
    return false;
  }
}

export const TEST_ONLY_REPORT_SCHEMA = "atb-745-test-only-report/v1";

export function stampTestOnlyReport(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SafetyError("test-only report must be a JSON object");
  }
  const prev =
    value.provenance && typeof value.provenance === "object" && !Array.isArray(value.provenance)
      ? value.provenance
      : {};
  const taskId = String(prev.taskId || prev.task_id || value.task_id || options.taskId || "").trim();
  if (!taskId) throw new SafetyError("test-only report task ID is required");
  const attemptId = String(
    prev.attemptId || options.attemptId || `${process.pid}.${Date.now()}`,
  ).trim();
  const generatedBy = String(prev.generatedBy || options.generatedBy || "scripts/load").trim();
  const schema = String(prev.schema || options.reportSchema || TEST_ONLY_REPORT_SCHEMA).trim();
  const targetEnvironment = String(
    prev.targetEnvironment || prev.target || value.target || options.targetEnvironment || "fixture",
  ).trim();
  const commit = String(prev.commit || value.commit || options.commit || "unspecified").trim();
  const provenance = {
    testOnly: true,
    schema,
    generatedBy,
    taskId,
    task_id: taskId,
    attemptId,
    targetEnvironment,
    target: targetEnvironment,
    commit,
  };
  Object.freeze(provenance);
  return {
    ...value,
    task_id: taskId,
    taskId,
    testOnly: true,
    provenance,
  };
}

function assertSafeUserPathString(userPath, label) {
  if (typeof userPath !== "string" || userPath.trim() === "") {
    throw new SafetyError(`${label} path is required`);
  }
  if (userPath.includes("\0") || userPath.includes("%00")) {
    throw new SafetyError(`${label} path contains NUL`);
  }
  if (EXTENDED_OR_UNC_RE.test(userPath) || userPath.startsWith("\\\\?\\")) {
    throw new SafetyError(`${label} UNC/extended paths are forbidden`);
  }
}

export function probeDirectoryHandleRename() {
  return {
    supported: false,
    reason: "node-fs-has-no-renameat",
    note: "fs.rename is path-based. Node does not expose renameat(2). Windows cannot bind rename to a directory fd. Residual post-validation TOCTOU is not eliminated.",
  };
}

function fsHooks(options = {}) {
  return {
    lstatSync: options.lstatSync ?? fs.lstatSync.bind(fs),
    existsSync: options.existsSync ?? fs.existsSync.bind(fs),
    readlinkSync: options.readlinkSync ?? fs.readlinkSync.bind(fs),
    realpathNative: options.realpathNative ?? fs.realpathSync.native.bind(fs.realpathSync),
    mkdirSync: options.mkdirSync ?? fs.mkdirSync.bind(fs),
    writeFileSync: options.writeFileSync ?? fs.writeFileSync.bind(fs),
    renameSync: options.renameSync ?? fs.renameSync.bind(fs),
    unlinkSync: options.unlinkSync ?? fs.unlinkSync.bind(fs),
    isLinkOrReparse: options.isLinkOrReparse,
  };
}

export function isLinkOrReparse(absPath, options = {}) {
  const hooks = fsHooks(options);
  if (typeof hooks.isLinkOrReparse === "function") {
    return hooks.isLinkOrReparse(absPath);
  }
  let st;
  try {
    st = hooks.lstatSync(absPath);
  } catch {
    return false;
  }
  if (st.isSymbolicLink()) return true;
  try {
    hooks.readlinkSync(absPath);
    return true;
  } catch {
    /* not a readable link */
  }
  // Detect reparse/junction without blessing the target: if canonicalization
  // diverges from the unresolved path, the component is link-like.
  try {
    const real = hooks.realpathNative(absPath);
    if (normalizeCompare(real) !== normalizeCompare(absPath)) return true;
  } catch {
    return true;
  }
  return false;
}

export function assertNotLinkOrReparse(absPath, label = "path", options = {}) {
  const hooks = fsHooks(options);
  if (!hooks.existsSync(absPath)) return;
  if (isLinkOrReparse(absPath, options)) {
    throw new SafetyError(`${label} must not be a symlink, junction, or reparse point`);
  }
}

export function collectExistingComponents(root, dest, options = {}) {
  const hooks = fsHooks(options);
  const anchored = path.resolve(root);
  const target = path.resolve(dest);
  if (!isPathInside(anchored, target) && normalizeCompare(anchored) !== normalizeCompare(target)) {
    throw new SafetyError("path escapes trusted root");
  }
  const rel = path.relative(anchored, target);
  const parts = rel ? rel.split(/[\\/]+/).filter(Boolean) : [];
  const list = [anchored];
  let cur = anchored;
  for (const part of parts) {
    cur = path.join(cur, part);
    if (!hooks.existsSync(cur)) break;
    list.push(cur);
  }
  return list;
}

export function identityOf(absPath, options = {}) {
  const hooks = fsHooks(options);
  const st = hooks.lstatSync(absPath);
  return {
    path: absPath,
    dev: st.dev,
    ino: st.ino,
    nlink: st.nlink,
    mode: st.mode,
    size: st.size,
    birthtimeMs: st.birthtimeMs,
    isLink: isLinkOrReparse(absPath, options),
  };
}

export function identitiesMatch(before, after) {
  if (!before || !after) return false;
  if (before.isLink || after.isLink) return false;
  if (before.dev !== after.dev) return false;
  if (before.ino && after.ino) return before.ino === after.ino;
  return (
    before.ino === after.ino &&
    before.size === after.size &&
    before.mode === after.mode &&
    before.birthtimeMs === after.birthtimeMs
  );
}

export function captureChainIdentity(root, dest, options = {}) {
  return collectExistingComponents(root, dest, options).map((p) => identityOf(p, options));
}

export function assertChainIdentityStable(snapshot, label = "path", options = {}) {
  const hooks = fsHooks(options);
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    throw new SafetyError(`${label} identity snapshot is missing`);
  }
  for (const before of snapshot) {
    if (!hooks.existsSync(before.path)) {
      throw new SafetyError(`${label} component disappeared before rename`);
    }
    const after = identityOf(before.path, options);
    if (after.isLink || !identitiesMatch(before, after)) {
      throw new SafetyError(`${label} component identity changed before rename`);
    }
    assertNotLinkOrReparse(before.path, `${label} component`, options);
  }
}

export function assertUnlinkedChain(root, dest, label = "path", options = {}) {
  const anchored = path.resolve(root);
  const target = path.resolve(dest);
  assertNotLinkOrReparse(anchored, `${label} root`, options);
  if (!isPathInside(anchored, target) && normalizeCompare(anchored) !== normalizeCompare(target)) {
    throw new SafetyError(`${label} path escapes trusted root`);
  }
  const rel = path.relative(anchored, target);
  if (rel && (path.isAbsolute(rel) || rel.split(/[\\/]/).includes(".."))) {
    throw new SafetyError(`${label} path escapes trusted root`);
  }
  for (const cur of collectExistingComponents(anchored, target, options)) {
    assertNotLinkOrReparse(cur, `${label} component`, options);
  }
}

function mkdirUnlinked(dir, stopAt, options = {}) {
  const hooks = fsHooks(options);
  const missing = [];
  let cur = path.resolve(dir);
  const stop = path.resolve(stopAt);
  while (normalizeCompare(cur) !== normalizeCompare(stop) && !hooks.existsSync(cur)) {
    missing.push(cur);
    const parent = path.dirname(cur);
    if (normalizeCompare(parent) === normalizeCompare(cur)) break;
    cur = parent;
  }
  if (hooks.existsSync(cur)) {
    const st = hooks.lstatSync(cur);
    if (!st.isDirectory()) throw new SafetyError("trusted root parent is not a directory");
    assertNotLinkOrReparse(cur, "mkdir parent", options);
  }
  for (const next of missing.reverse()) {
    hooks.mkdirSync(next);
    assertNotLinkOrReparse(next, "created directory", options);
  }
}

function joinRootFor(userPath, { trusted, workspaceRoot, defaultOutput, label }) {
  const relative = userPath.replace(/\\/g, "/");
  if (isUserAbsolutePath(userPath)) return path.dirname(path.resolve(userPath));
  if (trusted) return trusted;
  if (label === "catalog") return workspaceRoot;
  if (/^artifacts\/(load|evidence)(\/|$)/i.test(relative)) return workspaceRoot;
  if (label === "evidence") return path.join(workspaceRoot, "artifacts", "evidence");
  return defaultOutput;
}

function allowedRootsFor({ trusted, workspaceRoot, defaultOutput, evidenceDir, label }) {
  const roots = [];
  if (trusted) roots.push(trusted);
  if (label === "catalog") roots.push(workspaceRoot);
  if (label === "evidence") roots.push(evidenceDir);
  roots.push(defaultOutput);
  return [...new Set(roots.map((r) => path.resolve(r)))];
}

/**
 * @param {string} userPath
 * @param {{ workspaceRoot?: string, trustedOutputRoot?: string, role?: 'output'|'input-report'|'catalog'|'evidence' }} options
 */
export function resolveSafePath(userPath, options = {}) {
  const label = options.role ?? "output";
  assertSafeUserPathString(userPath, label);
  const hooks = fsHooks(options);

  const workspaceRoot = path.resolve(options.workspaceRoot ?? WORKSPACE_ROOT);
  const defaultOutput = path.join(workspaceRoot, "artifacts", "load");
  const evidenceDir = path.join(workspaceRoot, "artifacts", "evidence");
  const trusted = options.trustedOutputRoot
    ? path.resolve(options.trustedOutputRoot)
    : null;

  if (trusted) assertNotLinkOrReparse(trusted, "trusted output root", options);
  if (!trusted) assertNotLinkOrReparse(workspaceRoot, "workspace root", options);

  const joinRoot = joinRootFor(userPath, { trusted, workspaceRoot, defaultOutput, label });
  const candidate = isUserAbsolutePath(userPath)
    ? path.resolve(userPath)
    : path.resolve(joinRoot, userPath);

  const uniqueRoots = allowedRootsFor({
    trusted,
    workspaceRoot,
    defaultOutput,
    evidenceDir,
    label,
  });

  let containedRoot = null;
  for (const root of uniqueRoots) {
    if (isPathInside(root, candidate) || normalizeCompare(root) === normalizeCompare(candidate)) {
      containedRoot = root;
      break;
    }
  }
  if (!containedRoot) {
    throw new SafetyError(`${label} path escapes trusted root`);
  }

  if (hooks.existsSync(containedRoot)) {
    assertNotLinkOrReparse(containedRoot, `${label} trusted root`, options);
    const st = hooks.lstatSync(containedRoot);
    if (!st.isDirectory()) throw new SafetyError(`${label} trusted root must be a directory`);
  } else {
    const parentStop = trusted ?? workspaceRoot;
    mkdirUnlinked(containedRoot, parentStop, options);
    assertNotLinkOrReparse(containedRoot, `${label} trusted root`, options);
  }

  assertUnlinkedChain(containedRoot, candidate, label, options);

  const parent = path.dirname(candidate);
  if (hooks.existsSync(parent)) {
    assertNotLinkOrReparse(parent, `${label} parent`, options);
  } else {
    mkdirUnlinked(parent, containedRoot, options);
    assertNotLinkOrReparse(parent, `${label} parent`, options);
  }

  if (hooks.existsSync(candidate)) {
    assertNotLinkOrReparse(candidate, label, options);
  }
  return candidate;
}

export function resolveSafeOutputPath(userPath, options = {}) {
  return resolveSafePath(userPath, { ...options, role: options.role ?? "output" });
}

function writeTestOnlyJson(resolved, value, options, chainRoot) {
  const hooks = fsHooks(options);
  const dir = path.dirname(resolved);
  mkdirUnlinked(dir, chainRoot, options);
  assertNotLinkOrReparse(dir, "output parent", options);
  assertUnlinkedChain(chainRoot, resolved, "output", options);
  const snapshot = captureChainIdentity(chainRoot, resolved, options);
  const stagingDir = path.join(chainRoot, ".atb-staging");
  mkdirUnlinked(stagingDir, chainRoot, options);
  assertNotLinkOrReparse(stagingDir, "staging", options);
  const tmp = path.join(
    stagingDir,
    `${process.pid}.${Date.now()}.${path.basename(resolved)}.tmp`,
  );
  const json = `${JSON.stringify(value, null, 2)}\n`;
  hooks.writeFileSync(tmp, json, { encoding: "utf8", flag: "w" });
  try {
    // Residual portable TOCTOU: revalidation then path-based rename is not
    // renameat(dirfd). A destination swap between the last check and rename
    // is not eliminated. Test-only reports must never authorize GO.
    if (typeof options.onBeforeRename === "function") {
      options.onBeforeRename({ tmp, resolved, chainRoot, dir, stagingDir });
    }
    assertNotLinkOrReparse(chainRoot, "output root before rename", options);
    assertNotLinkOrReparse(stagingDir, "staging before rename", options);
    assertUnlinkedChain(chainRoot, resolved, "output", options);
    assertUnlinkedChain(chainRoot, tmp, "staging temp", options);
    assertChainIdentityStable(snapshot, "output", options);
    if (hooks.existsSync(resolved)) {
      assertNotLinkOrReparse(resolved, "output destination before rename", options);
    }
    hooks.renameSync(tmp, resolved);
  } catch (err) {
    try {
      if (hooks.existsSync(tmp)) hooks.unlinkSync(tmp);
    } catch {
      /* staging temp remains reachable under the trusted root */
    }
    throw err;
  }
  return resolved;
}

export function writeJsonAtomicSafe(filePath, value, options = {}) {
  const purpose = options.purpose ?? "fail-closed";
  const productionWrite =
    purpose === "production-evidence" ||
    purpose === "release-evidence" ||
    options.authorizeGo === true;

  if (productionWrite) {
    throw new SafetyError(
      "production/release evidence write fail-closed: no directory-handle atomic rename on this Node/Windows runtime; caller-supplied rename primitives are not trusted",
    );
  }

  if (purpose !== "test-only-report") {
    throw new SafetyError(
      "write purpose must be test-only-report; production/release writes are fail-closed",
    );
  }

  const resolved = resolveSafePath(filePath, {
    ...options,
    role: options.role ?? "output",
  });
  const chainRoot = options.trustedOutputRoot
    ? path.resolve(options.trustedOutputRoot)
    : path.resolve(options.workspaceRoot ?? WORKSPACE_ROOT);
  const stamped = stampTestOnlyReport(value, options);
  return writeTestOnlyJson(resolved, stamped, options, chainRoot);
}
