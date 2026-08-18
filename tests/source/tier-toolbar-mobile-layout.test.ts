import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");
const tierBoardApp = readFileSync(
  path.join(projectRoot, "components/TierBoardApp.tsx"),
  "utf8"
);

test("Tier control-bar uses intentional season/actions groups", () => {
  assert.match(
    tierBoardApp,
    /className="control-bar-season"/,
    "TierBoardApp must wrap year/season in .control-bar-season"
  );
  assert.match(
    tierBoardApp,
    /className="control-bar-actions"/,
    "TierBoardApp must wrap reload/share/more in .control-bar-actions"
  );
});

test("mobile control-bar stacks two groups instead of a 4-column lone-more wrap", () => {
  assert.match(
    globalsCss,
    /\.control-bar-season\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    "mobile season group must be a 2-column grid"
  );
  assert.match(
    globalsCss,
    /\.control-bar-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    "mobile actions group must be a 3-column grid"
  );
  assert.doesNotMatch(
    globalsCss,
    /\.control-bar\s*\{[^}]*grid-template-columns:\s*repeat\(4,/,
    ".control-bar must not keep the old 4-column grid that isolated the more button"
  );
});
