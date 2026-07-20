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

// Tokens that are defined unconditionally (directly or via alias) in both the
// dark-default :root block and the explicit-light block. A var() fallback on
// these is dead code and drifts out of sync with the real theme values (as
// happened with `var(--accent, #6366f1)` alongside a `#2dd4bf` dark accent).
const unconditionalTokens = ["--accent", "--accent-ink", "--bg", "--border", "--surface-raised"];

test("globals.css does not reintroduce stale color fallbacks on unconditionally-defined tokens", () => {
  for (const token of unconditionalTokens) {
    const fallbackPattern = new RegExp(
      `var\\(${escapeRegExp(token)}\\s*,\\s*[^)]+\\)`
    );
    assert.doesNotMatch(
      globalsCss,
      fallbackPattern,
      `${token} is unconditionally defined for both themes; var() fallback values on it go stale and must not be reintroduced`
    );
  }

  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');
  for (const token of unconditionalTokens) {
    const declaration = new RegExp(`${escapeRegExp(token)}\\s*:`);
    assert.match(
      darkTheme,
      declaration,
      `${token} must remain defined (directly or via alias) in the dark theme block`
    );
  }
  // --bg/--border/--surface-raised alias tokens (--background/--line/--surface-soft)
  // that are redefined per-theme rather than being redeclared themselves; only
  // the directly-redefined tokens are asserted in the light block here.
  for (const token of ["--accent", "--accent-ink"]) {
    const declaration = new RegExp(`${escapeRegExp(token)}\\s*:`);
    assert.match(
      lightTheme,
      declaration,
      `${token} must remain redefined in the explicit light theme block`
    );
  }
});
