import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const bottomSheetCss = readFileSync(
  path.join(projectRoot, "components/ui/bottom-sheet.css"),
  "utf8"
);
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

function themeBlock(selector: string) {
  const match = globalsCss.match(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`)
  );
  assert.ok(match, `Missing ${selector} theme block`);
  return match[1];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("bottom sheet does not fall back to hardcoded colors for semantic tokens", () => {
  // Color-valued var() fallbacks on color-bearing properties (color/background/border/outline)
  // are dead code once the token is unconditionally defined in globals.css, and drift out of
  // sync with the dark-default theme (see async-state.css / display-mode.css migrations).
  assert.doesNotMatch(
    bottomSheetCss,
    /\b(?:color|background|border(?:-\w+)?|outline)(?:-color)?\s*:[^;]*var\([^)]+,\s*(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)\)/i,
    "bottom-sheet CSS must not use color-valued var() fallbacks"
  );

  const semanticTokens = [
    ...new Set(
      [...bottomSheetCss.matchAll(/var\((--[\w-]+)\)/g)].map(([, token]) => token)
    ),
  ];
  assert.ok(
    semanticTokens.length > 0,
    "Expected at least one semantic color token reference"
  );

  // Tokens are guaranteed to resolve in both themes either because they are declared
  // directly in both blocks, or because they alias another token (e.g. `--focus: var(--accent)`)
  // that is itself overridden per theme — CSS custom properties resolve `var()` at use time,
  // so an alias declared only once in `:root` still tracks the active theme's palette.
  const darkTheme = themeBlock(":root");
  for (const token of semanticTokens) {
    const declaration = new RegExp(`${escapeRegExp(token)}\\s*:`);
    assert.match(darkTheme, declaration, `${token} must be defined in dark theme`);
  }
});
