import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
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

/** Exact token matrix from Issue #686. */
const TOKEN_MATRIX = {
  dark: {
    "--global-nav-logo-gradient-start": "#38bdf8",
    "--global-nav-logo-gradient-middle": "#818cf8",
    "--global-nav-logo-gradient-end": "#e879f9",
  },
  light: {
    "--global-nav-logo-gradient-start": "#0369a1",
    "--global-nav-logo-gradient-middle": "#4338ca",
    "--global-nav-logo-gradient-end": "#be185d",
  },
} as const;

const TOKEN_ORDER = [
  "--global-nav-logo-gradient-start",
  "--global-nav-logo-gradient-middle",
  "--global-nav-logo-gradient-end",
] as const;

function standaloneLogoRule() {
  // Match standalone .global-nav-logo only (not .global-nav.is-compact .global-nav-logo).
  const match = globalsCss.match(
    /(?:^|\n)\.global-nav-logo\s*\{([\s\S]*?)\n\}/
  );
  assert.ok(match, "standalone .global-nav-logo rule must exist");
  return match[0];
}

test("global-nav-logo tokens: exact dark and light values", () => {
  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');

  for (const token of TOKEN_ORDER) {
    const darkValue = TOKEN_MATRIX.dark[token];
    const lightValue = TOKEN_MATRIX.light[token];
    assert.match(
      darkTheme,
      new RegExp(`${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(darkValue)}\\s*;`),
      `${token} must be ${darkValue} in dark theme`
    );
    assert.match(
      lightTheme,
      new RegExp(`${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(lightValue)}\\s*;`),
      `${token} must be ${lightValue} in light theme`
    );
  }
});

test("standalone .global-nav-logo uses 90deg token gradient, no direct colors/fallbacks", () => {
  const rule = standaloneLogoRule();

  assert.match(
    rule,
    /background:\s*linear-gradient\(\s*90deg\s*,\s*var\(--global-nav-logo-gradient-start\)\s*,\s*var\(--global-nav-logo-gradient-middle\)\s*,\s*var\(--global-nav-logo-gradient-end\)\s*\)/,
    "logo background must be 90deg gradient with tokens in start/middle/end order"
  );

  assert.doesNotMatch(
    rule,
    /linear-gradient\(\s*135deg/i,
    "logo gradient must not be 135deg"
  );

  assert.doesNotMatch(
    rule,
    /#[0-9a-fA-F]{3,8}\b/,
    "standalone .global-nav-logo must not contain direct hex colors"
  );
  assert.doesNotMatch(
    rule,
    /\brgba?\(/i,
    "standalone .global-nav-logo must not contain rgb/rgba color literals"
  );
  assert.doesNotMatch(
    rule,
    /\bhsla?\(/i,
    "standalone .global-nav-logo must not contain hsl/hsla color literals"
  );
  assert.doesNotMatch(
    rule,
    /var\([^)]+,/,
    "standalone .global-nav-logo must not use CSS var fallbacks"
  );
});

test("standalone .global-nav-logo preserves text clipping and transparent fill", () => {
  const rule = standaloneLogoRule();

  assert.match(
    rule,
    /-webkit-background-clip:\s*text/,
    "must preserve -webkit-background-clip: text"
  );
  assert.match(
    rule,
    /background-clip:\s*text/,
    "must preserve background-clip: text"
  );
  assert.match(
    rule,
    /-webkit-text-fill-color:\s*transparent/,
    "must preserve -webkit-text-fill-color: transparent"
  );
});
