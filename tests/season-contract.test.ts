import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  autoDetectedSeasonLabelJa,
  currentSeasonLabelJa,
  equalSeasonRef,
  getCurrentAnimeSeason,
  getJstDateParts,
  getNextAnimeSeason,
  getPreviousAnimeSeason,
  jstStartUtc,
  MIN_SEASON_YEAR,
  MAX_SEASON_YEAR,
  nextSeason,
  normalizeSeason,
  parseSeasonPathParts,
  parseSeasonRef,
  parseSeasonYear,
  previousSeason,
  seasonHeadingJa,
  seasonLabelJa,
  seasonStartUtc,
  selectedSeasonLabelJa,
  shiftSeason
} from "../lib/season.ts";
import {
  applySeasonQuery,
  buildSeasonHref,
  canonicalizeSeasonSearchParams,
  mergeSeasonPatch,
  resolveSeasonQuery,
  seasonAwareHref,
  serializeSeasonPath,
  serializeSeasonQuery,
  withSeasonQuery
} from "../lib/season-url.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const seasonSource = readFileSync(path.join(directory, "../lib/season.ts"), "utf8");

const BOUNDARIES = [
  {
    name: "winter→spring",
    before: "2026-03-31T14:59:59.999Z",
    at: "2026-03-31T15:00:00.000Z",
    from: { year: 2026, season: "WINTER" as const },
    to: { year: 2026, season: "SPRING" as const }
  },
  {
    name: "spring→summer",
    before: "2026-06-30T14:59:59.999Z",
    at: "2026-06-30T15:00:00.000Z",
    from: { year: 2026, season: "SPRING" as const },
    to: { year: 2026, season: "SUMMER" as const }
  },
  {
    name: "summer→fall",
    before: "2026-09-30T14:59:59.999Z",
    at: "2026-09-30T15:00:00.000Z",
    from: { year: 2026, season: "SUMMER" as const },
    to: { year: 2026, season: "FALL" as const }
  },
  {
    name: "fall→next winter",
    before: "2025-12-31T14:59:59.999Z",
    at: "2025-12-31T15:00:00.000Z",
    from: { year: 2025, season: "FALL" as const },
    to: { year: 2026, season: "WINTER" as const }
  }
];

test("season.ts never reads host-local timezone getters", () => {
  assert.doesNotMatch(seasonSource, /\.getFullYear\s*\(/);
  assert.doesNotMatch(seasonSource, /\.getMonth\s*\(/);
  assert.doesNotMatch(seasonSource, /\.getDate\s*\(/);
  assert.doesNotMatch(seasonSource, /\.getTimezoneOffset\s*\(/);
  assert.match(seasonSource, /getUTCFullYear/);
  assert.match(seasonSource, /JST_OFFSET_MS/);
});

for (const boundary of BOUNDARIES) {
  test(`JST boundary ${boundary.name}: 1ms before stays previous quarter`, () => {
    assert.deepEqual(getCurrentAnimeSeason(new Date(boundary.before)), boundary.from);
  });

  test(`JST boundary ${boundary.name}: exact 00:00 JST starts next quarter`, () => {
    assert.deepEqual(getCurrentAnimeSeason(new Date(boundary.at)), boundary.to);
    assert.equal(seasonStartUtc(boundary.to).toISOString(), boundary.at);
  });
}

test("jstStartUtc is 00:00 JST independent of host offset", () => {
  const start = jstStartUtc(2026, 4, 1);
  assert.equal(start.toISOString(), "2026-03-31T15:00:00.000Z");
  const parts = getJstDateParts(start);
  assert.deepEqual(
    { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour },
    { year: 2026, month: 4, day: 1, hour: 0 }
  );
});

test("previous/next wrap fall→winter across years", () => {
  assert.deepEqual(nextSeason({ year: 2025, season: "FALL" }), { year: 2026, season: "WINTER" });
  assert.deepEqual(previousSeason({ year: 2026, season: "WINTER" }), { year: 2025, season: "FALL" });
  assert.deepEqual(getNextAnimeSeason(new Date("2025-12-31T15:00:00.000Z")), {
    year: 2026,
    season: "SPRING"
  });
  assert.deepEqual(getPreviousAnimeSeason(new Date("2026-01-01T00:00:00.000Z")), {
    year: 2025,
    season: "FALL"
  });
  assert.deepEqual(shiftSeason({ year: 2026, season: "SPRING" }, 5), {
    year: 2027,
    season: "SUMMER"
  });
});

test("parser accepts case-insensitive seasons and integer years in range", () => {
  assert.equal(normalizeSeason("winter"), "WINTER");
  assert.equal(normalizeSeason("Fall"), "FALL");
  assert.equal(normalizeSeason("banana"), null);
  assert.equal(parseSeasonYear("2026"), 2026);
  assert.equal(parseSeasonYear("2026.5"), null);
  assert.equal(parseSeasonYear("1899"), null);
  assert.equal(parseSeasonYear(String(MIN_SEASON_YEAR)), MIN_SEASON_YEAR);
  assert.equal(parseSeasonYear(String(MAX_SEASON_YEAR)), MAX_SEASON_YEAR);
  assert.deepEqual(parseSeasonRef({ year: "2024", season: "summer" }), {
    year: 2024,
    season: "SUMMER"
  });
});

test("path parser preserves lowercase legacy season landing URLs", () => {
  assert.deepEqual(parseSeasonPathParts("2026", "summer"), { year: 2026, season: "SUMMER" });
  assert.equal(parseSeasonPathParts("2026", "SUMMER"), null);
  assert.equal(parseSeasonPathParts("2026", "Summer"), null);
  assert.equal(serializeSeasonPath({ year: 2026, season: "SUMMER" }), "/seasons/2026/summer");
});

test("labels distinguish 今期 from 選択中の期", () => {
  const current = { year: 2026, season: "FALL" as const };
  assert.equal(seasonLabelJa("FALL", 2026), "2026秋");
  assert.equal(seasonHeadingJa(current), "2026年秋");
  assert.equal(currentSeasonLabelJa(current), "今期（2026年秋）");
  assert.equal(selectedSeasonLabelJa({ year: 2025, season: "WINTER" }), "選択中の期（2025年冬）");
  assert.equal(autoDetectedSeasonLabelJa(current), "現在（2026年秋）");
});

test("missing query falls back to current; invalid never mixes year and season", () => {
  const now = new Date("2026-05-01T00:00:00.000Z");
  const current = getCurrentAnimeSeason(now);
  const missing = resolveSeasonQuery(new URLSearchParams(), now);
  assert.equal(missing.missing, true);
  assert.equal(missing.invalid, false);
  assert.deepEqual(missing.ref, current);

  const invalid = canonicalizeSeasonSearchParams(
    new URLSearchParams("year=nope&season=WINTER&keep=1"),
    now
  );
  assert.equal(invalid.invalid, true);
  assert.deepEqual(invalid.ref, current);
  assert.equal(invalid.search, "keep=1");
  assert.equal(invalid.didChange, true);

  const mixed = canonicalizeSeasonSearchParams(
    new URLSearchParams("year=2020&season=banana"),
    now
  );
  assert.equal(mixed.invalid, true);
  assert.deepEqual(mixed.ref, current);

  const valid = canonicalizeSeasonSearchParams(
    new URLSearchParams("year=2020&season=winter"),
    now
  );
  assert.equal(valid.explicit, true);
  assert.equal(valid.invalid, false);
  assert.deepEqual(valid.ref, { year: 2020, season: "WINTER" });
  assert.equal(valid.search, "year=2020&season=WINTER");
  assert.equal(equalSeasonRef(valid.ref, current), false);
});

test("year-only query is valid only when allowYearOnly", () => {
  const now = new Date("2026-05-01T00:00:00.000Z");
  const denied = canonicalizeSeasonSearchParams(new URLSearchParams("year=2020"), now);
  assert.equal(denied.invalid, true);

  const allowed = canonicalizeSeasonSearchParams(new URLSearchParams("year=2020"), now, {
    allowYearOnly: true
  });
  assert.equal(allowed.invalid, false);
  assert.equal(allowed.yearScope, true);
  assert.equal(allowed.ref.year, 2020);
  assert.equal(allowed.search, "year=2020");
});

test("serializers keep query and path contracts", () => {
  const ref = { year: 2025, season: "WINTER" as const };
  assert.equal(serializeSeasonQuery(ref), "year=2025&season=WINTER");
  assert.equal(withSeasonQuery("/tier", ref), "/tier?year=2025&season=WINTER");
  assert.equal(withSeasonQuery("/#home-add-section", ref), "/?year=2025&season=WINTER#home-add-section");
});

test("Tier impressions links preserve the season in both directions and leave snapshots alone", () => {
  const search = new URLSearchParams("year=2024&season=SUMMER");
  for (const from of ["/", "/tier", "/tier/impressions", "/watchlist"]) {
    assert.equal(seasonAwareHref("/tier/impressions", from, search),
      "/tier/impressions?year=2024&season=SUMMER");
  }
  assert.equal(seasonAwareHref("/tier", "/tier/impressions", search),
    "/tier?year=2024&season=SUMMER");
  assert.equal(seasonAwareHref("/tier/impressions", "/seasons/2023/winter", new URLSearchParams()),
    "/tier/impressions?year=2023&season=WINTER");
  assert.equal(seasonAwareHref("/share/impressions/snapshot", "/tier", search),
    "/share/impressions/snapshot");
});

test("sequential year then season patches keep both dimensions from latest canonical", () => {
  let canonical = { year: 2023, season: "FALL" as const };
  let search = "year=2023&season=FALL";
  canonical = mergeSeasonPatch(canonical, { year: 2024 });
  search = applySeasonQuery(new URLSearchParams(search), canonical);
  canonical = mergeSeasonPatch(canonical, { season: "SUMMER" });
  search = applySeasonQuery(new URLSearchParams(search), canonical);
  assert.deepEqual(canonical, { year: 2024, season: "SUMMER" });
  assert.equal(search, "year=2024&season=SUMMER");
  assert.equal(buildSeasonHref("/", search, canonical), "/?year=2024&season=SUMMER");
});

test("sequential season then year patches keep both dimensions from latest canonical", () => {
  let canonical = { year: 2023, season: "WINTER" as const };
  let search = "year=2023&season=WINTER&keep=1";
  canonical = mergeSeasonPatch(canonical, { season: "SUMMER" });
  search = applySeasonQuery(new URLSearchParams(search), canonical);
  canonical = mergeSeasonPatch(canonical, { year: 2025 });
  search = applySeasonQuery(new URLSearchParams(search), canonical);
  assert.deepEqual(canonical, { year: 2025, season: "SUMMER" });
  assert.equal(search, "year=2025&season=SUMMER&keep=1");
  assert.equal(
    buildSeasonHref("/tier", search, canonical, "#board"),
    "/tier?year=2025&season=SUMMER&keep=1#board"
  );
});
