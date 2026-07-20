import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const sheetSource = readFileSync(
  path.join(projectRoot, "components/ui/BottomSheet.tsx"),
  "utf8"
);
const sheetCss = readFileSync(
  path.join(projectRoot, "components/ui/bottom-sheet.css"),
  "utf8"
);

/** Extract the `.bottom-sheet__close { ... }` rule body (top-level only). */
function closeButtonRuleBody(css: string): string {
  const match = css.match(/\.bottom-sheet__close\s*\{([^{}]*)\}/);
  assert.ok(match, "Missing .bottom-sheet__close rule");
  return match[1];
}

/** Extract the JSX close-control block (button with bottom-sheet__close). */
function closeButtonJsx(source: string): string {
  const match = source.match(
    /\{showCloseButton\s*\?\s*\(\s*<button[\s\S]*?<\/button>\s*\)\s*:\s*null\}/
  );
  assert.ok(match, "Missing showCloseButton close control block");
  return match[0];
}

test("default closeLabel is declared as 閉じる", () => {
  assert.match(
    sheetSource,
    /closeLabel\s*=\s*["']閉じる["']/,
    'Expected default closeLabel = "閉じる" in BottomSheet props destructuring'
  );
  assert.match(
    sheetSource,
    /closeLabel\?:\s*string/,
    "Expected closeLabel?: string on BottomSheetProps"
  );
});

test("close button visibly renders closeLabel (not only aria-label)", () => {
  const closeJsx = closeButtonJsx(sheetSource);

  assert.match(
    closeJsx,
    /className=["']bottom-sheet__close["']/,
    "Expected close button class"
  );
  assert.match(
    closeJsx,
    /aria-label=\{closeLabel\}/,
    "Expected aria-label={closeLabel} preserved"
  );
  // Visible children must be closeLabel (text node / expression), not only a11y attr.
  assert.match(
    closeJsx,
    />\s*\{closeLabel\}\s*</,
    "Expected visible close control content to be {closeLabel}"
  );
});

test("no × glyph remains in the close control", () => {
  const closeJsx = closeButtonJsx(sheetSource);

  assert.doesNotMatch(
    closeJsx,
    /[×✕✖]/,
    "Close control must not contain × / similar multiply glyphs"
  );
  assert.doesNotMatch(
    closeJsx,
    /aria-hidden=["']true["']/,
    "Close control must not use an aria-hidden icon span for the glyph"
  );
  assert.doesNotMatch(
    closeJsx,
    /&times;|&#215;|&#x00D7;/i,
    "Close control must not use HTML entity for ×"
  );
});

test("public API and close handler surface have no source-detectable regression", () => {
  // Controlled open API
  assert.match(sheetSource, /open:\s*boolean/);
  assert.match(sheetSource, /onOpenChange:\s*\(open:\s*boolean\)\s*=>\s*void/);
  assert.match(sheetSource, /showCloseButton\?:\s*boolean/);
  assert.match(sheetSource, /closeLabel\?:\s*string/);

  // Defaults preserved
  assert.match(sheetSource, /showCloseButton\s*=\s*true/);
  assert.match(sheetSource, /closeLabel\s*=\s*["']閉じる["']/);

  // Close still routes through requestClose → onOpenChange(false)
  assert.match(
    sheetSource,
    /const requestClose = useCallback\(\(\)\s*=>\s*\{\s*onOpenChange\(false\);\s*\},\s*\[onOpenChange\]\)/
  );
  const closeJsx = closeButtonJsx(sheetSource);
  assert.match(closeJsx, /onClick=\{requestClose\}/);

  // Dialog / Escape / backdrop behaviors still present
  assert.match(sheetSource, /role=["']dialog["']/);
  assert.match(sheetSource, /aria-modal=["']true["']/);
  assert.match(sheetSource, /event\.key\s*===\s*["']Escape["']/);
  assert.match(sheetSource, /handleBackdropClick/);
  assert.match(sheetSource, /className=["']bottom-sheet__backdrop["']/);
});

test("close CSS keeps min tap target >= 44px and avoids fixed square width", () => {
  const rule = closeButtonRuleBody(sheetCss);

  const minWidth = rule.match(/min-width:\s*(\d+)px/);
  const minHeight = rule.match(/min-height:\s*(\d+)px/);
  assert.ok(minWidth, "Expected min-width on .bottom-sheet__close");
  assert.ok(minHeight, "Expected min-height on .bottom-sheet__close");
  assert.ok(
    Number(minWidth[1]) >= 44,
    `min-width must be >= 44px, got ${minWidth[1]}px`
  );
  assert.ok(
    Number(minHeight[1]) >= 44,
    `min-height must be >= 44px, got ${minHeight[1]}px`
  );

  // Fixed width would clip Japanese label; width/height squares are disallowed.
  assert.doesNotMatch(
    rule,
    /(?<!min-)width:\s*\d+px/,
    "Fixed width on close button would clip Japanese label"
  );
  assert.doesNotMatch(
    rule,
    /(?<!min-)height:\s*\d+px/,
    "Fixed height square is not text-first; use min-height instead"
  );

  // Text-oriented typography (not icon-scale 22px glyph sizing alone).
  assert.match(rule, /font-size:\s*\d+px/);
  assert.match(rule, /line-height:\s*[\d.]+/);
  assert.match(rule, /white-space:\s*nowrap/);

  // Semantic tokens only for color (no raw hex/rgb in close rule).
  assert.match(rule, /color:\s*var\(--ink-secondary\)/);
  assert.doesNotMatch(
    rule,
    /#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|hsl\(|hsla\(/,
    "Close button must not introduce raw color literals"
  );
});
