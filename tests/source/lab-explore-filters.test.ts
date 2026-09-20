/**
 * ATB-764-LAB — Node-native source proof. No tsx.
 *   node --test tests/source/lab-explore-filters.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CULTURE_CYCLE_CHECKS } from "../../app/lab/explore-filters/culture-cycle.ts";
import {
  EMPTY_FILTER_COMBO,
  EXPLORE_FILTER_FIXTURES,
  LAB_ALLOWED_DOMAIN
} from "../../app/lab/explore-filters/fixture.ts";
import {
  DEFAULT_FILTERS,
  PRIMARY_WATCH_ACTION_LABEL,
  UNAVAILABLE_WATCH_LABEL,
  filterExploreItems,
  isLabApprovedWatchUrl,
  isLegallyWatchable,
  resetFilters,
  staffKey
} from "../../app/lab/explore-filters/filter.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const css = readFileSync(
  path.join(projectRoot, "app/lab/explore-filters/explore-filters.css"),
  "utf8"
);
const clientSource = readFileSync(
  path.join(projectRoot, "app/lab/explore-filters/explore-filters-client.tsx"),
  "utf8"
);
const pageSource = readFileSync(
  path.join(projectRoot, "app/lab/explore-filters/page.tsx"),
  "utf8"
);
const fixtureSource = readFileSync(
  path.join(projectRoot, "app/lab/explore-filters/fixture.ts"),
  "utf8"
);

function idsOf(filters) {
  return filterExploreItems(EXPLORE_FILTER_FIXTURES, filters).map((item) => item.id);
}

function collectText(value, bag) {
  if (typeof value === "string") {
    bag.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectText(entry, bag);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectText(entry, bag);
  }
}

test("deterministic availability, decade, studio, and staff filters", () => {
  assert.deepEqual(idsOf(DEFAULT_FILTERS), [
    "lab-ef-01",
    "lab-ef-02",
    "lab-ef-03",
    "lab-ef-04",
    "lab-ef-05",
    "lab-ef-06",
    "lab-ef-07"
  ]);
  assert.deepEqual(idsOf({ ...DEFAULT_FILTERS, availability: "legal" }), [
    "lab-ef-01",
    "lab-ef-02",
    "lab-ef-03",
    "lab-ef-04"
  ]);
  assert.deepEqual(idsOf({ ...DEFAULT_FILTERS, availability: "flatrate" }), [
    "lab-ef-01",
    "lab-ef-04"
  ]);
  assert.deepEqual(idsOf({ ...DEFAULT_FILTERS, availability: "rent" }), ["lab-ef-02"]);
  assert.deepEqual(idsOf({ ...DEFAULT_FILTERS, availability: "buy" }), ["lab-ef-03"]);
  assert.deepEqual(idsOf({ ...DEFAULT_FILTERS, availability: "unavailable" }), [
    "lab-ef-05",
    "lab-ef-06",
    "lab-ef-07"
  ]);
  assert.deepEqual(idsOf({ ...DEFAULT_FILTERS, decade: "2010s" }), [
    "lab-ef-01",
    "lab-ef-04",
    "lab-ef-05"
  ]);
  assert.deepEqual(idsOf({ ...DEFAULT_FILTERS, studio: "ラボスタジオ北" }), [
    "lab-ef-01",
    "lab-ef-03",
    "lab-ef-04"
  ]);
  assert.deepEqual(idsOf({ ...DEFAULT_FILTERS, staff: "高橋 葵｜監督" }), [
    "lab-ef-01",
    "lab-ef-04"
  ]);
  assert.deepEqual(
    idsOf({
      availability: "legal",
      decade: "2010s",
      studio: "ラボスタジオ北",
      staff: "高橋 葵｜監督"
    }),
    ["lab-ef-01", "lab-ef-04"]
  );
});

test("empty filter combo and reset restore the full catalog", () => {
  const empty = filterExploreItems(EXPLORE_FILTER_FIXTURES, EMPTY_FILTER_COMBO);
  assert.deepEqual(empty, []);
  const restored = filterExploreItems(EXPLORE_FILTER_FIXTURES, resetFilters());
  assert.equal(restored.length, EXPLORE_FILTER_FIXTURES.length);
  assert.deepEqual(
    restored.map((item) => item.id),
    idsOf(DEFAULT_FILTERS)
  );
});

test("unknown and permission-required fixtures are not legally watchable", () => {
  const unknown = EXPLORE_FILTER_FIXTURES.find((item) => item.id === "lab-ef-05");
  const permissionRequired = EXPLORE_FILTER_FIXTURES.find((item) => item.id === "lab-ef-06");
  const regionMismatch = EXPLORE_FILTER_FIXTURES.find((item) => item.id === "lab-ef-07");
  assert.ok(unknown);
  assert.ok(permissionRequired);
  assert.ok(regionMismatch);
  assert.equal(unknown.source.decision, "unknown");
  assert.equal(permissionRequired.source.decision, "permission-required");
  assert.equal(unknown.source.watchUrl, null);
  assert.equal(permissionRequired.source.watchUrl, null);
  assert.equal(regionMismatch.source.watchUrl, null);
  assert.equal(isLegallyWatchable(unknown), false);
  assert.equal(isLegallyWatchable(permissionRequired), false);
  assert.equal(isLegallyWatchable(regionMismatch), false);
});

test("allowed JP offers keep a lab-only watch URL", () => {
  const legal = EXPLORE_FILTER_FIXTURES.filter(isLegallyWatchable);
  assert.equal(legal.length, 4);
  for (const item of legal) {
    assert.equal(item.source.decision, "allowed");
    assert.equal(item.region, "JP");
    assert.ok(item.source.watchUrl);
    assert.equal(isLabApprovedWatchUrl(item.source.watchUrl), true);
    assert.ok(item.source.watchUrl.includes(LAB_ALLOWED_DOMAIN));
  }
});

test("fixture catalog does not collect real-world domains", () => {
  const bag: string[] = [];
  collectText(EXPLORE_FILTER_FIXTURES, bag);
  const joined = `${bag.join("\n")}\n${fixtureSource}`;
  assert.match(joined, /example\.invalid/);
  assert.doesNotMatch(
    joined,
    /netflix\.com|amazon\.co\.jp|anilist\.co|jikan\.moe|themoviedb\.org|vap\.co\.jp|abema\.tv|unext\.jp/
  );
  for (const item of EXPLORE_FILTER_FIXTURES) {
    assert.match(item.source.domain, /example\.invalid$/);
    if (item.source.watchUrl) {
      assert.equal(new URL(item.source.watchUrl).hostname.endsWith(".invalid"), true);
    }
  }
});

test("Japanese canonical titles and roles stay visible in source", () => {
  assert.match(clientSource, /正規視聴できる作品を、年代・スタジオ・スタッフからさがす/);
  assert.match(clientSource, /条件をリセット/);
  assert.match(clientSource, /PRIMARY_WATCH_ACTION_LABEL/);
  assert.match(pageSource, /さがすフィルタ Lab/);
  assert.equal(PRIMARY_WATCH_ACTION_LABEL, "正規配信で見る");
  assert.equal(UNAVAILABLE_WATCH_LABEL, "正規配信先を確認できません");
  for (const item of EXPLORE_FILTER_FIXTURES) {
    assert.match(item.titleJa, /ATB-764/);
    assert.ok(item.studio.nameJa);
    assert.ok(item.staff[0]?.nameJa);
    assert.ok(item.staff[0]?.roleJa);
    assert.notEqual(item.titleJa, item.titleRomaji);
  }
  assert.ok(EXPLORE_FILTER_FIXTURES.some((item) => staffKey(item.staff[0]) === "高橋 葵｜監督"));
});

test("Visual/Simple share the same primary action and do not hide filters", () => {
  assert.match(clientSource, /DisplayModeToggle/);
  assert.match(css, /html\[data-display-mode="simple"\] \.lab-ef-poster/);
  assert.doesNotMatch(clientSource, /<img\b/);
  assert.doesNotMatch(clientSource, /mode === "simple".*PRIMARY_WATCH_ACTION_LABEL/);
  assert.match(clientSource, /data-testid="lab-ef-primary-action"/);
  assert.match(clientSource, /data-testid="lab-ef-unavailable"/);
  const primaryCount = clientSource.split("PRIMARY_WATCH_ACTION_LABEL").length - 1;
  assert.ok(primaryCount >= 2, "primary watch label must be the selected-result action");
});

test("scoped CSS keeps 44px targets, focus, and reduced motion", () => {
  assert.match(css, /--lab-ef-tap:\s*44px/);
  assert.match(
    css,
    /\.lab-ef-select,\s*\.lab-ef-reset,\s*\.lab-ef-result,\s*\.lab-ef-primary\s*\{[^}]*min-height:\s*var\(--lab-ef-tap\)/,
    "interactive controls must share the 44px tap token"
  );
  assert.match(css, /\.lab-ef-select:focus-visible/);
  assert.match(css, /\.lab-ef-reset:focus-visible/);
  assert.match(css, /\.lab-ef-result:focus-visible/);
  assert.match(css, /\.lab-ef-primary:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /transition:\s*none/);
  assert.match(css, /@media \(min-width:\s*720px\)/);
  assert.match(css, /@media \(max-width:\s*430px\)/);
  assert.doesNotMatch(css, /min-height:\s*40px/);
});

test("culture-cycle check records loop, legal watch, creators, and access", () => {
  const byId = Object.fromEntries(CULTURE_CYCLE_CHECKS.map((check) => [check.id, check]));
  assert.equal(CULTURE_CYCLE_CHECKS.length, 11);
  assert.equal(byId.loop.result, "該当");
  assert.match(byId.loop.note, /正規視聴CTAの1つ/);
  assert.equal(byId["legal-watch"].result, "該当");
  assert.equal(byId.creators.result, "該当");
  assert.equal(byId.metric.result, "該当");
  assert.match(byId.metric.note, /Creator Discovery Rate/);
  assert.equal(byId.access.result, "該当");
  assert.match(clientSource, /文化循環チェック/);
  assert.match(clientSource, /data-testid="lab-ef-culture-cycle"/);
});

test("lab mock stays independent of production explore and live APIs", () => {
  assert.doesNotMatch(clientSource, /from "@\/lib\//);
  assert.doesNotMatch(clientSource, /fetch\(/);
  assert.doesNotMatch(clientSource, /\/api\//);
  assert.doesNotMatch(pageSource, /redirect\(/);
  assert.doesNotMatch(pageSource, /auth\(/);
});

test("lab modules use explicit .ts extensions for Node ESM resolution", () => {
  const filterSource = readFileSync(
    path.join(projectRoot, "app/lab/explore-filters/filter.ts"),
    "utf8"
  );
  assert.match(filterSource, /from "\.\/fixture\.ts"/);
  assert.match(filterSource, /from "\.\/types\.ts"/);
  assert.doesNotMatch(filterSource, /from "\.\/fixture"/);
  assert.doesNotMatch(filterSource, /from "\.\/types"/);
  assert.match(fixtureSource, /from "\.\/types\.ts"/);
  assert.match(clientSource, /from "\.\/filter\.ts"/);
  assert.match(pageSource, /from "\.\/explore-filters-client\.tsx"/);
});
