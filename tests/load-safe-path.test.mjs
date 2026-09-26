import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DEFAULT_OUTPUT_DIR,
  isLinkOrReparse,
  isPathInside,
  isUserAbsolutePath,
  probeDirectoryHandleRename,
  resolveSafePath,
  writeJsonAtomicSafe,
} from "../scripts/load/safe-path.mjs";
import { SafetyError, parseArgs } from "../scripts/load/read-harness.mjs";
import { parseWriteArgs } from "../scripts/load/write-harness.mjs";
import { parseSmokeArgs } from "../scripts/load/production-smoke.mjs";
import { parseCapacityArgs } from "../scripts/load/capacity-report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tryCreateLink(target, dest, type) {
  try {
    fs.symlinkSync(target, dest, type);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}

function linkCreationUnsupported(error) {
  const code = error?.code;
  return ["EPERM", "EACCES", "ENOTSUP", "EUNKNOWN"].includes(code);
}

test("relative output names stay under artifacts/load", () => {
  const resolved = resolveSafePath("gate-path-test.json", {
    workspaceRoot: ROOT,
    role: "output",
  });
  assert.equal(isPathInside(DEFAULT_OUTPUT_DIR, resolved), true);
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
});

test("CLI absolute Windows path and parent traversal are rejected", () => {
  const abs = "C:\\Windows\\Temp\\atb-745-escape.json";
  assert.equal(isUserAbsolutePath(abs), true);
  assert.throws(
    () => resolveSafePath(abs, { workspaceRoot: ROOT, role: "output" }),
    SafetyError,
  );
  assert.throws(
    () => resolveSafePath("..\\..\\package.json", { workspaceRoot: ROOT, role: "output" }),
    SafetyError,
  );
  assert.throws(
    () =>
      resolveSafePath("artifacts\\load\\..\\..\\package.json", {
        workspaceRoot: ROOT,
        role: "output",
      }),
    SafetyError,
  );
  assert.throws(() => parseArgs(["--report", abs]), SafetyError);
  assert.throws(() => parseWriteArgs(["--report", abs]), SafetyError);
  assert.throws(() => parseSmokeArgs(["--report", abs]), SafetyError);
  assert.throws(() => parseCapacityArgs(["--out", abs]), SafetyError);
  assert.throws(() => parseArgs(["--report", "..\\..\\package.json"]), SafetyError);
});

test("programmatic trustedOutputRoot allows temp directories only", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-safe-"));
  const dest = path.join(dir, "report.json");
  const resolved = resolveSafePath(dest, {
    workspaceRoot: ROOT,
    trustedOutputRoot: dir,
    role: "output",
  });
  assert.equal(isPathInside(dir, resolved), true);
  assert.throws(
    () =>
      resolveSafePath("C:\\Windows\\Temp\\atb-745-escape.json", {
        workspaceRoot: ROOT,
        trustedOutputRoot: dir,
        role: "output",
      }),
    SafetyError,
  );
});

test("rejects symlink or junction on artifacts/load; injected detector when actual link creation is unsupported", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-repo-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-out-"));
  fs.mkdirSync(path.join(repo, "artifacts"));
  const loadDir = path.join(repo, "artifacts", "load");
  const types = process.platform === "win32" ? ["junction", "dir"] : ["dir"];
  let created = false;
  let lastErr = null;
  for (const type of types) {
    const attempt = tryCreateLink(outside, loadDir, type);
    if (attempt.ok) {
      created = true;
      break;
    }
    lastErr = attempt.error;
    if (fs.existsSync(loadDir)) fs.rmSync(loadDir, { recursive: true, force: true });
  }
  if (created) {
    assert.equal(isLinkOrReparse(loadDir), true);
    try {
      assert.throws(
        () => resolveSafePath("report.json", { workspaceRoot: repo, role: "output" }),
        /symlink|junction|reparse|link/i,
      );
      assert.equal(fs.existsSync(path.join(outside, "report.json")), false);
    } finally {
      fs.rmSync(loadDir, { recursive: true, force: true });
    }
    return;
  }
  assert.equal(created, false);
  if (lastErr && !linkCreationUnsupported(lastErr)) throw lastErr;
  fs.mkdirSync(loadDir, { recursive: true });
  const injected = (p) => p === loadDir || isLinkOrReparse(p);
  assert.throws(
    () =>
      resolveSafePath("report.json", {
        workspaceRoot: repo,
        role: "output",
        isLinkOrReparse: injected,
      }),
    /symlink|junction|reparse|link/i,
  );
  assert.equal(fs.existsSync(path.join(outside, "report.json")), false);
});

function collectTmpFiles(root) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const p = path.join(dir, name);
      let st;
      try {
        st = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".tmp")) found.push(p);
    }
  };
  walk(root);
  return found;
}

test("component swap before rename fails closed and leaves no staging temp", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-swap-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-swap-out-"));
  fs.mkdirSync(path.join(repo, "artifacts", "load"), { recursive: true });
  const dest = path.join(repo, "artifacts", "load", "out.json");
  let tmpPath = null;
  const hook = ({ tmp }) => {
    tmpPath = tmp;
    const artifacts = path.join(repo, "artifacts");
    const moved = path.join(repo, "artifacts.moved");
    fs.renameSync(artifacts, moved);
    tryCreateLink(outside, artifacts, process.platform === "win32" ? "junction" : "dir");
  };
  assert.throws(
    () =>
      writeJsonAtomicSafe(dest, { ok: true, task_id: "ATB-745-TEST" }, {
        workspaceRoot: repo,
        purpose: "test-only-report",
        onBeforeRename: hook,
      }),
    /symlink|junction|reparse|link|identity|component/i,
  );
  assert.equal(fs.existsSync(dest), false);
  assert.equal(fs.existsSync(path.join(outside, "out.json")), false);
  assert.equal(tmpPath && fs.existsSync(tmpPath), false);
  assert.deepEqual(collectTmpFiles(repo), []);
  assert.deepEqual(collectTmpFiles(outside), []);
  assert.deepEqual(collectTmpFiles(path.join(repo, "artifacts.moved")), []);
});

test("rejects trustedOutputRoot when it is a junction or symlink; injected detector otherwise", () => {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-real-"));
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-parent-"));
  const linked = path.join(parent, "linked-root");
  const types = process.platform === "win32" ? ["junction", "dir"] : ["dir"];
  let created = false;
  let lastErr = null;
  for (const type of types) {
    const attempt = tryCreateLink(real, linked, type);
    if (attempt.ok) {
      created = true;
      break;
    }
    lastErr = attempt.error;
    if (fs.existsSync(linked)) fs.rmSync(linked, { recursive: true, force: true });
  }
  if (created) {
    try {
      assert.throws(
        () =>
          resolveSafePath("report.json", {
            workspaceRoot: ROOT,
            trustedOutputRoot: linked,
            role: "output",
          }),
        /symlink|junction|reparse|link/i,
      );
    } finally {
      fs.rmSync(linked, { recursive: true, force: true });
    }
    return;
  }
  assert.equal(created, false);
  if (lastErr && !linkCreationUnsupported(lastErr)) throw lastErr;
  fs.mkdirSync(linked, { recursive: true });
  assert.throws(
    () =>
      resolveSafePath("report.json", {
        workspaceRoot: ROOT,
        trustedOutputRoot: linked,
        role: "output",
        isLinkOrReparse: (p) => p === linked || isLinkOrReparse(p),
      }),
    /symlink|junction|reparse|link/i,
  );
});

test("production/release evidence writes fail closed; directory-handle rename is unproven", () => {
  const probe = probeDirectoryHandleRename();
  assert.equal(probe.supported, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-prodwrite-"));
  const dest = path.join(dir, "release.json");
  assert.throws(
    () =>
      writeJsonAtomicSafe(dest, { go: true }, {
        workspaceRoot: dir,
        trustedOutputRoot: dir,
        purpose: "release-evidence",
      }),
    /fail-closed|directory-handle|TOCTOU/i,
  );
  assert.equal(fs.existsSync(dest), false);
  assert.throws(
    () =>
      writeJsonAtomicSafe(dest, { go: true }, {
        workspaceRoot: dir,
        trustedOutputRoot: dir,
        purpose: "production-evidence",
      }),
    SafetyError,
  );
  assert.throws(
    () =>
      writeJsonAtomicSafe(dest, { go: true }, {
        workspaceRoot: dir,
        trustedOutputRoot: dir,
      }),
    SafetyError,
  );
});

test("caller-supplied safeRenamePrimitive cannot authorize production writes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-malicious-"));
  const dest = path.join(dir, "release.json");
  let invoked = false;
  assert.throws(
    () => writeJsonAtomicSafe(dest, { go: true }, {
      workspaceRoot: dir,
      trustedOutputRoot: dir,
      purpose: "release-evidence",
      safeRenamePrimitive: () => {
        invoked = true;
      },
    }),
    /fail-closed|not trusted/i,
  );
  assert.equal(invoked, false);
  assert.equal(fs.existsSync(dest), false);
});

test("test-only output requires a non-empty task ID and stamps both provenance flags", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-provenance-"));
  assert.throws(
    () => writeJsonAtomicSafe("missing-task.json", { ok: true }, {
      workspaceRoot: dir,
      trustedOutputRoot: dir,
      purpose: "test-only-report",
    }),
    /task ID is required/i,
  );
  writeJsonAtomicSafe("tasked.json", { ok: true, task_id: "ATB-745-TEST" }, {
    workspaceRoot: dir,
    trustedOutputRoot: dir,
    purpose: "test-only-report",
  });
  const report = JSON.parse(fs.readFileSync(path.join(dir, "tasked.json"), "utf8"));
  assert.equal(report.testOnly, true);
  assert.equal(report.task_id, "ATB-745-TEST");
  assert.equal(report.provenance.testOnly, true);
  assert.equal(report.provenance.task_id, "ATB-745-TEST");
  assert.equal(report.provenance.taskId, "ATB-745-TEST");
});

test("injected race still cannot deliver a write onto a swapped destination", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-race-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "atb745-race-out-"));
  fs.mkdirSync(path.join(repo, "artifacts", "load"), { recursive: true });
  const dest = path.join(repo, "artifacts", "load", "out.json");
  const swapped = new Set();
  assert.throws(
    () =>
      writeJsonAtomicSafe(dest, { ok: true, task_id: "ATB-745-TEST" }, {
        workspaceRoot: repo,
        purpose: "test-only-report",
        isLinkOrReparse: (p) => swapped.has(p) || isLinkOrReparse(p),
        onBeforeRename: ({ dir }) => {
          swapped.add(dir);
        },
      }),
    /symlink|junction|reparse|link|identity|component/i,
  );
  assert.equal(fs.existsSync(dest), false);
  assert.equal(fs.existsSync(path.join(outside, "out.json")), false);
});
