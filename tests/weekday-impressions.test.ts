import assert from "node:assert/strict";
import { test } from "node:test";
import { clampDateToSeason, impressionCandidatesForDate, impressionWeek, jstDateKey, shiftDateKey } from "../lib/season-impressions-view.ts";

const anime = (id: string, title = id) => ({ id, source: id.startsWith("jikan-") ? "jikan" as const : "anilist" as const, title, imageUrl: null });

test("JST date keys require real instants and do not depend on host DST", () => {
  assert.equal(jstDateKey("2026-03-08T01:30:00-08:00"), "2026-03-08");
  assert.equal(jstDateKey("2026-03-08T10:00:00Z"), "2026-03-08");
  assert.equal(jstDateKey("2026-10-04T18:30:00-04:00"), "2026-10-05");
  for (const invalid of ["2026-10-05", "2026-02-29T00:00:00Z", "2026-13-01T00:00:00Z", "2026-01-01 00:00:00Z", "", "not-a-date"]) assert.equal(jstDateKey(invalid), null, invalid);
  assert.equal(jstDateKey(new Date(NaN)), null);
  assert.equal(jstDateKey(Number.NaN), null);
});

test("date arithmetic is strict, Monday-Sunday and crosses month/year safely", () => {
  assert.deepEqual(impressionWeek("2026-01-01"), ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  assert.deepEqual(impressionWeek("2026-10-11"), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.equal(shiftDateKey("2024-02-28", 1), "2024-02-29");
  assert.equal(shiftDateKey("2026-12-31", 1), "2027-01-01");
  for (const invalid of ["2026-02-29", "2026-2-01", "2026-00-01", "nope"]) assert.equal(shiftDateKey(invalid, 1), null);
  assert.equal(shiftDateKey("2026-01-01", 0.5), null);
});

test("date selection clamps invalid, day and week crossings to the selected season", () => {
  const fall = { year: 2026, season: "FALL" as const };
  assert.equal(clampDateToSeason("2026-09-30", fall), "2026-10-01");
  assert.equal(clampDateToSeason("2027-01-01", fall), "2026-12-31");
  assert.equal(clampDateToSeason("2026-11-08", fall), "2026-11-08");
  assert.equal(clampDateToSeason("bad", fall, new Date("2026-11-09T00:00:00Z")), "2026-11-09");
  assert.equal(clampDateToSeason(null, { year: 2026, season: "WINTER" }, new Date("2027-01-01T00:00:00Z")), "2026-03-31");
});

test("daily candidates use only valid recentEpisodes and nextEpisode, dedupe IDs and sort actual instants", () => {
  const catalog = [anime("anilist-1"), anime("jikan-2"), anime("anilist-3")];
  const airing = [
    { id: "anilist-1", airing: { broadcastDay: "monday", recentEpisodes: [
      { episode: 2, airingAt: "2026-10-05T00:30:00+09:00" },
      { episode: 1, airingAt: "2026-10-04T15:30:00Z" },
      { episode: 0, airingAt: "2026-10-05T02:00:00+09:00" },
      { episode: 3, airingAt: "bad" }
    ], nextEpisode: { episode: 3, airingAt: "2026-10-12T00:30:00+09:00" } } },
    { id: "anilist-1", airing: { nextEpisode: { episode: 4, airingAt: "2026-10-05T03:00:00+09:00" } } },
    { id: "jikan-2", airing: { recentEpisodes: [{ episode: 1, airingAt: "2026-10-04T16:00:00Z" }] } },
    { id: "anilist-3", airing: { startDate: "2026-10-05", broadcastTime: "22:00" } },
    { id: "anilist-999", airing: { nextEpisode: { episode: 1, airingAt: "2026-10-05T01:00:00+09:00" } } },
    { id: "bad-id", airing: { nextEpisode: { episode: 1, airingAt: "2026-10-05T01:00:00+09:00" } } }
  ];
  assert.deepEqual(impressionCandidatesForDate(catalog, airing, "2026-10-05").map(({ anime, airingAt }) => [anime.id, airingAt]), [
    ["anilist-1", "2026-10-05T00:30:00+09:00"], ["jikan-2", "2026-10-04T16:00:00Z"]
  ]);
  assert.deepEqual(impressionCandidatesForDate(catalog, airing, "2026-10-06"), []);
  assert.deepEqual(impressionCandidatesForDate(catalog, airing, "bad"), []);
});
