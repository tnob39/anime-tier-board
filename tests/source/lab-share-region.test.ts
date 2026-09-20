import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PIRATE_HOST_MARKERS = [
  "nyaa",
  "aniwave",
  "9anime",
  "gogoanime",
  "kickassanime",
  "hianime",
  "animixplay",
  "zoro.to",
  "anitaku",
];

const CULTURE_CYCLE_KEYS = [
  "loop",
  "legal-watch",
  "canonical",
  "creator",
  "rating",
  "source",
  "persist",
  "metric",
  "ia",
  "scope",
  "access",
];

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const labDir = path.join(projectRoot, "app/lab/share-region");

const labFiles = readdirSync(labDir).sort();
const labSources = Object.fromEntries(
  labFiles.map((name) => [name, readFileSync(path.join(labDir, name), "utf8")])
);
const joined = Object.values(labSources).join("\n");
const css = labSources["share-region.css"] ?? "";
const client = labSources["share-region-client.tsx"] ?? "";
const fixtures = labSources["fixtures.ts"] ?? "";

test("lab share-region files stay in the allowed sandbox", () => {
  assert.deepEqual(
    labFiles,
    ["fixtures.ts", "page.tsx", "share-region-client.tsx", "share-region.css"],
    "only the four lab share-region modules may exist"
  );
  assert.match(labSources["page.tsx"], /robots:\s*\{\s*index:\s*false/);
  assert.match(client, /data-hydrated=\{hydrated \? "true" : "false"\}/);
  assert.doesNotMatch(joined, /fetch\s*\(/);
  assert.doesNotMatch(joined, /\/api\//);
  assert.doesNotMatch(client, /from\s+"@\/lib\//);
});

test("confirmed region keeps source+region+checked-at and a legitimate watch href", () => {
  assert.match(fixtures, /export const LAB_CHECKED_AT = "2026-09-01T03:00:00\.000Z"/);
  assert.match(
    fixtures,
    /export const LAB_AVAILABILITY_SOURCE = "tmdb-watch-providers"/
  );
  assert.match(
    fixtures,
    /JP: \{[\s\S]*availability: "confirmed"[\s\S]*region: "JP"[\s\S]*href: NETFLIX_JP_HREF/
  );
  assert.match(fixtures, /const NETFLIX_JP_HREF = "https:\/\/www\.netflix\.com\/jp\/"/);
  assert.match(fixtures, /LEGITIMATE_WATCH_HOSTS = \["www\.netflix\.com"\]/);
});

test("unavailable region does not guess a provider", () => {
  assert.match(
    fixtures,
    /XX: \{[\s\S]*availability: "unavailable"[\s\S]*region: "XX"[\s\S]*provider: null/
  );
  assert.match(client, /配信元を推測して表示していません/);
  assert.match(client, /data-primary-action="watch"/);
  assert.match(
    client,
    /region\.availability === "confirmed" && region\.provider/
  );
});

test("canonical Japanese title keeps English translation alongside, not as a replacement", () => {
  assert.match(fixtures, /canonicalTitle: "葬送のフリーレン"/);
  assert.match(fixtures, /translatedTitle: "Frieren: Beyond Journey's End"/);
  assert.match(client, /data-testid="lab-share-region-canonical-title"/);
  assert.match(client, /lang="ja"/);
  assert.match(client, /data-testid="lab-share-region-translated-title"/);
  assert.match(client, /lang="en"/);
  assert.match(css, /\.lab-share-region__titles/);
  assert.match(
    css,
    /@media \(min-width:\s*768px\)[\s\S]*\.lab-share-region__titles[\s\S]*display:\s*flex/
  );
});

test("spoiler is hidden by default in source", () => {
  assert.match(client, /useState\(false\)/);
  assert.match(client, /hidden=\{!spoilerOpen\}/);
  assert.match(client, /ネタバレを表示/);
  assert.doesNotMatch(client, /useState\(true\)/);
});

test("Visual / Simple share titles, region, CTA, and spoiler; Simple has no poster slot", () => {
  assert.match(client, /mode === "visual"/);
  assert.match(client, /data-testid="lab-share-region-poster"/);
  assert.match(client, /ビジュアル/);
  assert.match(client, /シンプル/);
  assert.match(
    client,
    /\{mode === "visual" \? \([\s\S]*lab-share-region-poster[\s\S]*\) : null\}/
  );
  assert.doesNotMatch(
    client,
    /mode === "simple"[\s\S]{0,200}data-primary-action/
  );
  assert.match(css, /data-display-mode="visual"/);
});

test("exactly one primary watch action is gated on confirmed availability", () => {
  const primaryMatches = client.match(/data-primary-action="watch"/g) ?? [];
  assert.equal(primaryMatches.length, 1, "exactly one primary action marker");
  assert.match(
    client,
    /const primaryCount = region\.availability === "confirmed" \? 1 : 0/
  );
  assert.match(client, /data-primary-count=\{primaryCount\}/);
});

test("scoped CSS keeps 44px targets, focus, reduced-motion, and token colors", () => {
  assert.match(
    css,
    /\.lab-share-region__mode-btn,\s*\n\.lab-share-region__spoiler-toggle,\s*\n\.lab-share-region__primary \{\s*\n\s*min-height:\s*44px;\s*\n\s*min-width:\s*44px;/
  );
  assert.match(css, /:focus-visible \{[\s\S]*outline:\s*2px solid var\(--focus\)/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*transition:\s*none;[\s\S]*transform:\s*none;/
  );
  assert.match(css, /max-width:\s*640px/);
  assert.match(css, /padding:\s*16px 16px 96px/);
  assert.doesNotMatch(
    css,
    /#[0-9a-f]{3,8}\b|\brgba?\(/i,
    "lab CSS must use semantic tokens, not raw colors"
  );
  assert.doesNotMatch(css, /(^|\n)(?!\s*\.lab-share-region)[.#a-z].*\{/i);
});

test("culture-cycle check covers the North Star items", () => {
  assert.match(client, /文化循環チェック/);
  assert.match(client, /data-cycle=\{item\.key\}/);
  for (const key of CULTURE_CYCLE_KEYS) {
    assert.match(fixtures, new RegExp(`key: "${key}"`));
  }
  assert.match(fixtures, /Global Share Utility/);
});

test("lab copy is Japanese and never points at pirate or guessed hosts", () => {
  assert.match(client, /受け取り地域/);
  assert.match(client, /正規視聴/);
  assert.match(client, /ネタバレ/);
  assert.match(client, /スタジオ/);
  for (const marker of PIRATE_HOST_MARKERS) {
    assert.doesNotMatch(
      joined.toLowerCase(),
      new RegExp(marker.replace(".", "\\.")),
      `must not mention pirate marker ${marker}`
    );
  }
});
