import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

test(".status-chip-group.is-compact .status-chip keeps a 44px minimum tap target", () => {
  const rule = /\.status-chip-group\.is-compact \.status-chip\s*\{([^}]*)\}/;
  const match = globalsCss.match(rule);
  assert.ok(match, "Missing .status-chip-group.is-compact .status-chip rule");
  const body = match[1];

  assert.match(
    body,
    /min-height:\s*44px/,
    ".status-chip-group.is-compact .status-chip must use a 44px minimum tap target"
  );
  assert.doesNotMatch(
    body,
    /min-height:\s*28px/,
    ".status-chip-group.is-compact .status-chip must not regress to the old sub-44px tap target"
  );
});
