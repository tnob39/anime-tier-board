import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

test("mobile-responsive suite and ledger artifacts exist", () => {
  assert.ok(
    existsSync(path.join(projectRoot, "tests/mobile-responsive.spec.ts")),
    "tests/mobile-responsive.spec.ts must exist"
  );
  assert.ok(
    existsSync(
      path.join(projectRoot, "docs/reviews/mobile-responsive-audit-grok-20260816.md")
    ),
    "audit ledger must exist"
  );
});

// Pins for landed loop fixes are appended below as each FIXED loop lands.
// NO_DEFECT / BLOCKED loops intentionally have no pin.

test("L1 season-page cover link keeps aspect-ratio for broken images", () => {
  const rule = /\.season-page-cover-link\s*\{([^}]*)\}/;
  const match = globalsCss.match(rule);
  assert.ok(match, "Missing .season-page-cover-link rule");
  assert.match(
    match[1],
    /aspect-ratio:\s*2\s*\/\s*3/,
    "cover link must pin 2/3 aspect-ratio so broken images cannot inflate cards"
  );
  assert.match(match[1], /overflow:\s*hidden/, "cover link must clip broken-image overflow");
});

test("L2 card-provider-badge wraps multiple logos", () => {
  const rule = /\.card-provider-badge\s*\{([^}]*)\}/;
  const match = globalsCss.match(rule);
  assert.ok(match, "Missing .card-provider-badge rule");
  assert.match(match[1], /flex-wrap:\s*wrap/, "badge container must wrap multi-provider clones");
  assert.match(match[1], /max-width:/, "badge container must not exceed card width");
});

test("L3 mobile-bottom-nav flexes to item count", () => {
  const navRule = globalsCss.match(
    /\.mobile-bottom-nav\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g
  );
  assert.ok(navRule && navRule.length > 0, "Missing .mobile-bottom-nav rules");
  const flexRule = navRule.find((r) => /display:\s*flex/.test(r));
  assert.ok(flexRule, "mobile-bottom-nav must use flex so column count follows rendered links");
  assert.doesNotMatch(
    flexRule,
    /grid-template-columns:\s*repeat\(4/,
    "must not hard-code 4-column grid"
  );
  const linkMatch = globalsCss.match(
    /\.mobile-bottom-nav-link\s*\{([^}]*)\}/
  );
  assert.ok(linkMatch, "Missing .mobile-bottom-nav-link rule");
  assert.match(linkMatch[1], /flex:\s*1\s+1\s+0/, "each nav link shares equal flex space");
  assert.match(linkMatch[1], /min-height:\s*44px/, "nav links keep 44px tap target");
  assert.match(linkMatch[1], /white-space:\s*nowrap/, "nav labels must not wrap to two lines");
});

test("L4 body reserves nav height plus safe-area", () => {
  assert.match(
    globalsCss,
    /padding-bottom:\s*calc\(80px\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    "body bottom reserve must be >= nav height + offset + 8 and include safe-area"
  );
});

test("L6 .field select keeps 44px tap target", () => {
  const field = globalsCss.match(/\.field\s*\{([^}]*)\}/);
  assert.ok(field, "Missing .field rule");
  assert.match(field[1], /min-height:\s*44px/, ".field must be at least 44px");
  const select = globalsCss.match(/\.field select\s*\{([^}]*)\}/);
  assert.ok(select, "Missing .field select rule");
  assert.match(select[1], /min-height:\s*44px/, ".field select must be at least 44px");
});

// CSS pins alone never substitute for rendered E2E assertions.
test("E2E suite hard-asserts production metrics (not style-injection masked)", () => {
  const spec = readFileSync(
    path.join(projectRoot, "tests/mobile-responsive.spec.ts"),
    "utf8"
  );
  assert.match(spec, /function assertNoHorizontalOverflow/);
  assert.match(spec, /function assertBrokenCoverGeometry/);
  assert.match(spec, /function assertNavChrome/);
  assert.match(spec, /function measureShellBounds/);
  // Must not re-introduce layout-masking inline patches in setExactViewport.
  assert.doesNotMatch(
    spec,
    /document\.(documentElement|body)\.style\.(maxWidth|overflowX)\s*=/
  );
  // L9 comparison is mandatory for L10 (not optional pass path).
  assert.match(spec, /L10 requires L9 matrix\.json evidence/);
  assert.match(spec, /L9 vs L10 overflow matrix \(mandatory\)/);
});
