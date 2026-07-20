import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const cardsCss = readFileSync(
  path.join(projectRoot, "components/home-context-cards.css"),
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

/** Strip transparent / currentColor so only real color literals remain for checks. */
function stripAllowedColorKeywords(css: string) {
  return css
    .replace(/\btransparent\b/gi, "")
    .replace(/\bcurrentColor\b/gi, "");
}

test("home context cards use semantic variables for all colors", () => {
  const colorScan = stripAllowedColorKeywords(cardsCss);

  assert.doesNotMatch(
    colorScan,
    /#[0-9a-f]{3,8}\b|\brgba?\(|color-mix\(/i,
    "home context cards CSS must not contain direct hex, rgb/rgba, or color-mix colors"
  );

  // Color-valued var() fallbacks: second arg is hex / rgb(a) / named color keywords
  assert.doesNotMatch(
    cardsCss,
    /var\([^)]+,\s*(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)\)/i,
    "home context cards CSS must not use color-valued var() fallbacks"
  );

  const semanticTokens = [
    ...new Set(
      [...cardsCss.matchAll(/var\((--hcc-[\w-]+)\)/g)].map(([, token]) => token)
    ),
  ];
  assert.ok(
    semanticTokens.length > 0,
    "Expected at least one --hcc-* token reference"
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
