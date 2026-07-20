import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const watchlistCss = readFileSync(
  path.join(projectRoot, "app/watchlist/watchlist-v2-grok.css"),
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

test("watchlist V2 uses semantic variables for all colors", () => {
  assert.doesNotMatch(
    watchlistCss,
    /#[0-9a-f]{3,8}\b|\brgba?\(/i,
    "watchlist V2 CSS must not contain direct hex, rgb, or rgba colors"
  );

  const semanticTokens = [
    ...new Set(
      [...watchlistCss.matchAll(/var\((--watchlist-[\w-]+)\)/g)].map(
        ([token]) => token.slice(4, -1)
      )
    ),
  ];
  assert.ok(semanticTokens.length > 0, "Expected watchlist semantic tokens");

  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');
  for (const token of semanticTokens) {
    const declaration = new RegExp(`${escapeRegExp(token)}\\s*:`);
    assert.match(darkTheme, declaration, `${token} must be defined in dark theme`);
    assert.match(lightTheme, declaration, `${token} must be defined in light theme`);
  }
});
