import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const pageTsx = readFileSync(path.join(projectRoot, "app/updates/page.tsx"), "utf8");
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

/** Closed 18-tone matrix: tone → exact foreground hex (soft = hex + "1a"). */
const TONE_MATRIX = {
  red: "#ef4444",
  indigo: "#6366f1",
  sky: "#0ea5e9",
  "indigo-light": "#818cf8",
  emerald: "#10b981",
  amber: "#f59e0b",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  teal: "#0f766e",
  pink: "#ec4899",
  green: "#16a34a",
  purple: "#7c3aed",
  lavender: "#a07ef7",
  azure: "#4f8ef7",
  mint: "#4fc48e",
  orange: "#f7a74f",
  coral: "#f76f4f",
  gold: "#f7b24f",
} as const;

type Tone = keyof typeof TONE_MATRIX;
const TONES = Object.keys(TONE_MATRIX) as Tone[];

test("updates page has no direct icon colors or iconColor", () => {
  assert.doesNotMatch(
    pageTsx,
    /\biconColor\b/,
    "page.tsx must not retain iconColor"
  );
  assert.doesNotMatch(
    pageTsx,
    /#[0-9a-fA-F]{3,8}\b/,
    "page.tsx must not contain direct hex color literals"
  );
  assert.doesNotMatch(
    pageTsx,
    /\brgba?\(/i,
    "page.tsx must not contain rgb/rgba color literals"
  );

  assert.match(
    pageTsx,
    /type IconTone\s*=/,
    "page.tsx must declare closed IconTone union"
  );

  for (const tone of TONES) {
    assert.match(
      pageTsx,
      new RegExp(`\\|\\s*"${escapeRegExp(tone)}"`),
      `IconTone union must include "${tone}"`
    );
  }

  assert.match(
    pageTsx,
    /iconTone:\s*IconTone/,
    "Release changes must use iconTone: IconTone"
  );
  assert.match(
    pageTsx,
    /updates-icon-wrap updates-icon-tone-\$\{change\.iconTone\}/,
    "icon wrap must apply tone class from iconTone"
  );
  assert.doesNotMatch(
    pageTsx,
    /color=\{change\./,
    "Icon must not receive a runtime color prop"
  );
  assert.doesNotMatch(
    pageTsx,
    /background:\s*`\$\{/,
    "must not construct wrapper background from runtime hex + alpha"
  );
});

test("updates icon tokens: 18 tones / 36 definitions exact in both themes", () => {
  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');

  assert.equal(TONES.length, 18, "must define exactly 18 tones");

  let definitionCount = 0;
  for (const tone of TONES) {
    const ink = TONE_MATRIX[tone];
    const soft = `${ink}1a`;
    const inkToken = `--updates-icon-${tone}-ink`;
    const softToken = `--updates-icon-${tone}-soft`;

    for (const [label, block] of [
      ["dark", darkTheme],
      ["light", lightTheme],
    ] as const) {
      const inkDecl = new RegExp(
        `${escapeRegExp(inkToken)}\\s*:\\s*${escapeRegExp(ink)}\\s*;`
      );
      const softDecl = new RegExp(
        `${escapeRegExp(softToken)}\\s*:\\s*${escapeRegExp(soft)}\\s*;`
      );
      assert.match(
        block,
        inkDecl,
        `${inkToken} must be ${ink} in ${label} theme`
      );
      assert.match(
        block,
        softDecl,
        `${softToken} must be ${soft} in ${label} theme`
      );
      definitionCount += 2;
    }
  }

  // 18 tones × 2 tokens × 2 themes = 72 declaration matches; 36 unique token names
  assert.equal(definitionCount, 72, "36 tokens declared identically in both themes");

  const uniqueTokenNames = TONES.flatMap((tone) => [
    `--updates-icon-${tone}-ink`,
    `--updates-icon-${tone}-soft`,
  ]);
  assert.equal(uniqueTokenNames.length, 36, "must expose exactly 36 token names");
});

test("updates icon CSS maps each tone class to ink/soft tokens", () => {
  for (const tone of TONES) {
    const rule = new RegExp(
      `\\.updates-icon-wrap\\.updates-icon-tone-${escapeRegExp(tone)}\\s*\\{[^}]*color:\\s*var\\(--updates-icon-${escapeRegExp(tone)}-ink\\)[^}]*background:\\s*var\\(--updates-icon-${escapeRegExp(tone)}-soft\\)[^}]*\\}`,
      "s"
    );
    assert.match(
      globalsCss,
      rule,
      `tone class ${tone} must map color→ink and background→soft`
    );
  }
});
