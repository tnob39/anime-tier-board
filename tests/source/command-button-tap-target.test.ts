import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

test(".command-button shares a 44px minimum tap target with .icon-button", () => {
  const rule = /\.command-button,\s*\n\.icon-button\s*\{([^}]*)\}/;
  const match = globalsCss.match(rule);
  assert.ok(match, "Missing shared .command-button, .icon-button rule");
  const body = match[1];

  assert.match(
    body,
    /min-height:\s*44px/,
    ".command-button/.icon-button base rule must use a 44px minimum tap target"
  );
  assert.doesNotMatch(
    body,
    /min-height:\s*40px/,
    ".command-button/.icon-button base rule must not regress to a sub-44px tap target"
  );
});
