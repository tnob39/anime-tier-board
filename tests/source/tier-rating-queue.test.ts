import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const tierBoardApp = readFileSync(
  path.join(projectRoot, "components/TierBoardApp.tsx"),
  "utf8"
);
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle);
  assert.ok(start >= 0 && end > start, `missing ${startNeedle} .. ${endNeedle}`);
  return source.slice(start, end);
}

test("matchesRatingQueueSeason is fail-closed on missing or unrecognized season/year", () => {
  const body = sliceBetween(
    tierBoardApp,
    "export function matchesRatingQueueSeason",
    "export function selectRatingQueueCandidateIds"
  );
  assert.match(body, /Number\.isFinite\(item\.seasonYear\)/);
  assert.match(body, /typeof item\.seasonYear !== "number"/);
  assert.match(body, /normalizeSeason\(String\(item\.season\)\)/);
  assert.match(body, /if \(!normalized \|\| normalized !== season\)/);
  assert.match(body, /item\.season == null \|\| String\(item\.season\)\.length === 0/);
  assert.doesNotMatch(body, /\.title/);
  assert.doesNotMatch(body, /titles/);
  assert.doesNotMatch(
    body,
    /if \(normalized && normalized !== season\)/,
    "must not fail-open when normalizeSeason returns null"
  );
});

test("selectRatingQueueCandidateIds matches by anime ID, completed, unranked, and season helper", () => {
  const body = sliceBetween(
    tierBoardApp,
    "export function selectRatingQueueCandidateIds",
    "export function restoreItemToExactPosition"
  );
  assert.match(body, /statusMap\[itemId\] !== "completed"/);
  assert.match(body, /itemsById\.get\(itemId\)/);
  assert.match(body, /deferredIds\.has\(itemId\)/);
  assert.match(body, /matchesRatingQueueSeason\(item, season, seasonYear\)/);
  assert.doesNotMatch(body, /\.title/);
  assert.doesNotMatch(body, /titles/);
});

test("status GET failure stays on the queue surface and does not setWarning", () => {
  const effectStart = tierBoardApp.indexOf('fetch("/api/statuses"');
  assert.ok(effectStart >= 0);
  const effectSlice = tierBoardApp.slice(effectStart, effectStart + 1800);
  assert.match(effectSlice, /setStatusLoadState\("error"\)/);
  assert.doesNotMatch(effectSlice, /setWarning\(/);
  assert.doesNotMatch(effectSlice, /setError\(/);
});

test("queue UI keeps Japanese labels, 44px targets, focus, and reduced-motion", () => {
  assert.match(tierBoardApp, /評価待ち/);
  assert.match(tierBoardApp, /あとで/);
  assert.match(tierBoardApp, /元に戻す/);
  assert.match(tierBoardApp, /残り \{remainingCount\} 件/);
  assert.match(tierBoardApp, /<small>現在<\/small>/);
  assert.match(tierBoardApp, /statusLoadState === "loading"/);
  assert.match(tierBoardApp, /statusLoadState === "error"/);
  assert.match(tierBoardApp, /status="empty"/);

  const queueCssStart = globalsCss.indexOf(".rating-queue {");
  assert.ok(queueCssStart >= 0);
  const queueCss = globalsCss.slice(queueCssStart);
  assert.match(queueCss, /min-height:\s*44px/);
  assert.match(queueCss, /:focus-visible/);
  assert.match(queueCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(queueCss, /rating-queue--simple/);
});
