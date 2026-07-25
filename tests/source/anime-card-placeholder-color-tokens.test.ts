import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const componentTsx = readFileSync(
  path.join(projectRoot, "components/AnimeCardPlaceholder.tsx"),
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

/** Closed 10-tone matrix: tone → exact hex (component-owned palette). */
const TONE_MATRIX = {
  indigo: "#6366f1",
  violet: "#8b5cf6",
  pink: "#ec4899",
  rose: "#f43f5e",
  sky: "#0ea5e9",
  cyan: "#06b6d4",
  emerald: "#10b981",
  teal: "#14b8a6",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

type Tone = keyof typeof TONE_MATRIX;
const TONES = Object.keys(TONE_MATRIX) as Tone[];

/** Exact ordered pairs from prior component palette. */
const TONE_PAIRS: readonly [Tone, Tone][] = [
  ["indigo", "violet"],
  ["pink", "rose"],
  ["sky", "cyan"],
  ["emerald", "teal"],
  ["amber", "red"],
  ["violet", "pink"],
  ["cyan", "sky"],
  ["teal", "emerald"],
];

const LABEL_TOKENS = {
  "--anime-card-placeholder-label-ink": "rgba(255, 255, 255, 0.9)",
  "--anime-card-placeholder-label-shadow-color": "rgba(0, 0, 0, 0.4)",
} as const;

const ALL_TOKEN_NAMES = [
  ...TONES.map((tone) => `--anime-card-placeholder-tone-${tone}`),
  ...Object.keys(LABEL_TOKENS),
] as const;

test("AnimeCardPlaceholder has no direct color literals or inline color style", () => {
  assert.doesNotMatch(
    componentTsx,
    /#[0-9a-fA-F]{3,8}\b/,
    "component must not contain direct hex color literals"
  );
  assert.doesNotMatch(
    componentTsx,
    /\brgba?\(/i,
    "component must not contain rgb/rgba color literals"
  );
  assert.doesNotMatch(
    componentTsx,
    /style=\{\{/,
    "component must not use inline style objects for colors"
  );
  assert.doesNotMatch(
    componentTsx,
    /linear-gradient\s*\(/i,
    "component must not construct gradients in TSX"
  );
  assert.doesNotMatch(
    componentTsx,
    /var\([^)]+,/,
    "component must not use CSS var fallbacks"
  );

  assert.match(
    componentTsx,
    /anime-card-placeholder-pair-\$\{from\}-\$\{to\}/,
    "component must apply pair class from hashed tones"
  );
  assert.match(
    componentTsx,
    /hash\s*=\s*\(hash\s*\*\s*31\s*\+\s*title\.charCodeAt\(i\)\)\s*&\s*0xffffff/,
    "title hashing algorithm must be preserved"
  );
  assert.match(
    componentTsx,
    /hash\s*%\s*TONE_PAIRS\.length/,
    "pair selection must remain hash % palette length"
  );

  for (const [from, to] of TONE_PAIRS) {
    assert.match(
      componentTsx,
      new RegExp(`\\[\\s*"${from}"\\s*,\\s*"${to}"\\s*\\]`),
      `TONE_PAIRS must include ordered pair ${from}/${to}`
    );
  }

  assert.match(
    componentTsx,
    /role="img"/,
    "a11y role=img must be preserved"
  );
  assert.match(
    componentTsx,
    /aria-label=\{title\}/,
    "a11y aria-label must be preserved"
  );
  assert.match(
    componentTsx,
    /draggable=\{draggable\}/,
    "draggable prop wiring must be preserved"
  );
});

test("placeholder tokens: 12 exact definitions in both themes", () => {
  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');

  assert.equal(TONES.length, 10, "must define exactly 10 tones");
  assert.equal(ALL_TOKEN_NAMES.length, 12, "must expose exactly 12 token names");

  let definitionCount = 0;
  for (const tone of TONES) {
    const value = TONE_MATRIX[tone];
    const token = `--anime-card-placeholder-tone-${tone}`;
    for (const [label, block] of [
      ["dark", darkTheme],
      ["light", lightTheme],
    ] as const) {
      const decl = new RegExp(
        `${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(value)}\\s*;`
      );
      assert.match(block, decl, `${token} must be ${value} in ${label} theme`);
      definitionCount += 1;
    }
  }

  for (const [token, value] of Object.entries(LABEL_TOKENS)) {
    for (const [label, block] of [
      ["dark", darkTheme],
      ["light", lightTheme],
    ] as const) {
      const decl = new RegExp(
        `${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(value)}\\s*;`
      );
      assert.match(block, decl, `${token} must be ${value} in ${label} theme`);
      definitionCount += 1;
    }
  }

  // 12 tokens × 2 themes
  assert.equal(definitionCount, 24, "12 tokens declared identically in both themes");
});

test("placeholder CSS pairs use 135deg gradients via tokens only (no color literals/fallbacks)", () => {
  assert.equal(TONE_PAIRS.length, 8, "must keep exactly eight ordered pairs");

  for (const [from, to] of TONE_PAIRS) {
    const pairClass = `anime-card-placeholder-pair-${from}-${to}`;
    const rule = new RegExp(
      `\\.anime-card-placeholder\\.${escapeRegExp(pairClass)}\\s*\\{[^}]*background:\\s*linear-gradient\\(\\s*135deg\\s*,\\s*var\\(--anime-card-placeholder-tone-${escapeRegExp(from)}\\)\\s*,\\s*var\\(--anime-card-placeholder-tone-${escapeRegExp(to)}\\)\\s*\\)`,
      "s"
    );
    assert.match(
      globalsCss,
      rule,
      `pair ${from}/${to} must map to 135deg gradient with tone tokens`
    );
  }

  // Anchor on base layout rule (height: 128px) — avoid matching season-share overrides.
  const baseRule = globalsCss.match(
    /(?:^|\n)\.anime-card-placeholder\s*\{[^}]*height:\s*128px[^}]*\}/
  );
  assert.ok(baseRule, "base .anime-card-placeholder rule with height 128px must exist");

  const spanRule = globalsCss.match(/\.anime-card-placeholder span\s*\{[^}]+\}/);
  assert.ok(spanRule, ".anime-card-placeholder span rule must exist");
  assert.match(
    spanRule[0],
    /color:\s*var\(--anime-card-placeholder-label-ink\)/,
    "label color must use label-ink token"
  );
  assert.match(
    spanRule[0],
    /text-shadow:\s*0\s+1px\s+4px\s+var\(--anime-card-placeholder-label-shadow-color\)/,
    "label shadow must use label-shadow-color token"
  );

  // Pair rules and span rule must not introduce hex/rgba literals or var fallbacks
  const pairAndSpanSlice = globalsCss.match(
    /\.anime-card-placeholder\.anime-card-placeholder-pair-indigo-violet[\s\S]*?\.anime-card-placeholder span\s*\{[^}]+\}/
  );
  assert.ok(pairAndSpanSlice, "pair rules + span block must be present");
  assert.doesNotMatch(
    pairAndSpanSlice[0],
    /#[0-9a-fA-F]{3,8}\b/,
    "pair/span CSS must not contain direct hex colors"
  );
  assert.doesNotMatch(
    pairAndSpanSlice[0],
    /\brgba?\(/i,
    "pair/span CSS must not contain rgb/rgba color literals"
  );
  assert.doesNotMatch(
    pairAndSpanSlice[0],
    /var\([^)]+,/,
    "pair/span CSS must not use CSS var fallbacks"
  );
});

test("hash→pair selection preserves length and modular mapping", () => {
  // Mirror component hash so source contract stays tied to behavior
  function pairIndex(title: string): number {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = (hash * 31 + title.charCodeAt(i)) & 0xffffff;
    }
    return hash % TONE_PAIRS.length;
  }

  assert.equal(TONE_PAIRS.length, 8);
  assert.ok(pairIndex("a") >= 0 && pairIndex("a") < 8);
  assert.equal(pairIndex(""), pairIndex(""));
  // Stable: same title → same pair class name in component source pattern
  const sample = "進撃の巨人";
  const idx = pairIndex(sample);
  const [from, to] = TONE_PAIRS[idx];
  assert.match(
    componentTsx,
    new RegExp(`\\[\\s*"${from}"\\s*,\\s*"${to}"\\s*\\]`),
    "hashed sample must land on a declared ordered pair"
  );
});
