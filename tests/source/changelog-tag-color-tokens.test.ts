import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
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

/** Closed 4-tag matrix: tag → exact ink hex (unchanged from pre-token value). */
const TAG_MATRIX = {
  feat: "#4f8ef7",
  fix: "#f76f4f",
  perf: "#4fc48e",
  refactor: "#a07ef7",
} as const;

type Tag = keyof typeof TAG_MATRIX;
const TAGS = Object.keys(TAG_MATRIX) as Tag[];

test("changelog tag tokens: 4 tags defined identically in both themes", () => {
  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');

  assert.equal(TAGS.length, 4, "must define exactly 4 tags");

  for (const tag of TAGS) {
    const ink = TAG_MATRIX[tag];
    const token = `--changelog-tag-${tag}`;

    for (const [label, block] of [
      ["dark", darkTheme],
      ["light", lightTheme],
    ] as const) {
      const decl = new RegExp(`${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(ink)}\\s*;`);
      assert.match(block, decl, `${token} must be ${ink} in ${label} theme`);
    }
  }
});

test("changelog tag CSS rules reference tokens, not direct hex", () => {
  for (const tag of TAGS) {
    const selector = tag === "fix" ? "\\.changelog-tag-fix\\s{0,2}" : `\\.changelog-tag-${tag}`;
    const rule = new RegExp(
      `${selector}\\s*\\{[^}]*background:\\s*color-mix\\(in srgb, var\\(--changelog-tag-${tag}\\) 15%, transparent\\);\\s*color:\\s*var\\(--changelog-tag-${tag}\\);[^}]*\\}`
    );
    assert.match(globalsCss, rule, `.changelog-tag-${tag} must reference --changelog-tag-${tag}`);
  }

  const changelogTagRules = globalsCss.match(/\.changelog-tag-(feat|fix|perf|refactor)[^{]*\{[^}]*\}/g) ?? [];
  assert.equal(changelogTagRules.length, 4, "must find exactly 4 changelog tag rules");
  for (const rule of changelogTagRules) {
    assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b/, `rule must not contain direct hex: ${rule}`);
  }
});
