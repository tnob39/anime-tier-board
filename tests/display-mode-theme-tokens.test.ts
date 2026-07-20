import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const toggleCss = readFileSync(
  path.join(projectRoot, "components/display-mode/display-mode.css"),
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

test("display mode toggle uses semantic variables for all colors", () => {
  assert.doesNotMatch(
    toggleCss,
    /#[0-9a-f]{3,8}\b|\brgba?\(/i,
    "display-mode toggle CSS must not contain direct hex, rgb, or rgba colors"
  );

  // Color-valued var() fallbacks on color-bearing properties (color/background/border/outline)
  assert.doesNotMatch(
    toggleCss,
    /\b(?:color|background|border(?:-\w+)?|outline)(?:-color)?\s*:[^;]*var\([^)]+,\s*(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)\)/i,
    "display-mode toggle CSS must not use color-valued var() fallbacks"
  );

  const semanticTokens = [
    ...new Set(
      [...toggleCss.matchAll(/var\((--[\w-]+)\)/g)].map(([, token]) => token)
    ),
  ];
  assert.ok(
    semanticTokens.length > 0,
    "Expected at least one semantic color token reference"
  );

  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');
  for (const token of semanticTokens) {
    const declaration = new RegExp(`${escapeRegExp(token)}\\s*:`);
    assert.match(darkTheme, declaration, `${token} must be defined in dark theme`);
    assert.match(
      lightTheme,
      declaration,
      `${token} must be defined in light theme`
    );
  }
});
