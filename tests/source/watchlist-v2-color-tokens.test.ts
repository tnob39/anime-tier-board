import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const sharedCss = readFileSync(
  path.join(projectRoot, "app/watchlist/watchlist-v2-shared.css"),
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

const REQUIRED_TOKENS = [
  "--watchlist-vbadge-ink",
  "--watchlist-vbadge-shadow",
  "--watchlist-vbadge-codex-surface",
  "--watchlist-vbadge-grok-surface",
] as const;

const TOKEN_VALUES: Record<(typeof REQUIRED_TOKENS)[number], string> = {
  "--watchlist-vbadge-ink": "#fff",
  "--watchlist-vbadge-shadow": "rgba(0, 0, 0, 0.25)",
  "--watchlist-vbadge-codex-surface": "#2563eb",
  "--watchlist-vbadge-grok-surface": "#16a34a",
};

test("watchlist V2 shared badge uses semantic tokens for residual colors", () => {
  assert.doesNotMatch(
    sharedCss,
    /#[0-9a-f]{3,8}\b|\brgba?\(/i,
    "watchlist-v2-shared.css must not contain direct hex, rgb, or rgba colors"
  );

  for (const token of REQUIRED_TOKENS) {
    assert.match(
      sharedCss,
      new RegExp(`var\\(${escapeRegExp(token)}\\)`),
      `shared CSS must reference ${token}`
    );
  }

  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');

  for (const token of REQUIRED_TOKENS) {
    const value = TOKEN_VALUES[token];
    const declaration = new RegExp(
      `${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(value)}\\s*;`
    );
    assert.match(
      darkTheme,
      declaration,
      `${token} must keep value ${value} in dark theme`
    );
    assert.match(
      lightTheme,
      declaration,
      `${token} must keep value ${value} in light theme`
    );
  }
});
