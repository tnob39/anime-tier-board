import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveImpressionCandidates, recentImpressionAiring, impressionAiringLabel, sortImpressionRecords,
  searchImpressionCatalog, changeImpressionInput, impressionGrowthCopy } from "../lib/season-impressions-view.ts";
import { sanitizeImpressionAnalytics, track, type ImpressionAnalyticsEvent } from "../lib/analytics.ts";
import { buildImpressionSnapshot, readImpressionAnime, type ImpressionAnime, type SeasonImpression } from "../lib/season-impressions-model.ts";

const now = Date.parse("2026-10-03T01:00:00Z");
const catalog: ImpressionAnime[] = Array.from({ length: 94 }, (_, i) => ({ id: `anilist-${i + 1}`, source: "anilist", title: `作品${String(i + 1).padStart(2, "0")}`, imageUrl: "" }));
const record = (index: number, extra: Partial<SeasonImpression> = {}): SeasonImpression => ({ year: 2026, season: "FALL", anime: catalog[index], rating: null,
  note: null, spoiler: "unspecified", revision: 1, checkedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...extra });

test("fixed-time deterministic candidates: owner drafts, supplied airing, recent saved, unchecked with dedupe", () => {
  const input = { catalog, drafts: [record(3)], records: [record(1)], airing: [{ id: catalog[2].id, airing: { recentEpisodes: [{ episode: 1, airingAt: "2026-10-02T15:30:00Z" }] } }], now };
  const first = deriveImpressionCandidates(input);
  assert.deepEqual(first.map((entry) => [entry.anime.id, entry.reason]), [["anilist-4", "draft"], ["anilist-3", "airing"], ["anilist-2", "saved"]]);
  assert.deepEqual(deriveImpressionCandidates({ ...input, catalog: [...catalog].reverse() }), first);
  assert.equal(first.length, 3);
  assert.deepEqual(deriveImpressionCandidates({ ...input, drafts: [record(2)], records: [record(2)] }).map((entry) => entry.anime.id), ["anilist-3", "anilist-1", "anilist-10"]);
  assert.equal(deriveImpressionCandidates({ ...input, airing: [], records: [], drafts: [] })[0].reason, "unchecked");
  assert.equal(impressionAiringLabel(first[1].airingAt!), "放送情報：10/3 00:30（参考）");
  assert.equal(catalog.length, 94);
});

test("48h inclusive boundaries, future, invalid, missing and no inference from nextEpisode", () => {
  for (const [value, expected] of [[now, true], [now - 48 * 3600000, true], [now - 48 * 3600000 - 1, false], [now + 1, false]] as const) {
    const airingAt = new Date(value).toISOString();
    assert.equal(recentImpressionAiring({ recentEpisodes: [{ episode: 1, airingAt }] }, now), expected ? airingAt : undefined);
  }
  for (const airingAt of ["bad", "", "2026-02-30T00:00:00Z", "2026-10-03", "2026-10-03T09:00:00"]) {
    assert.equal(recentImpressionAiring({ recentEpisodes: [{ episode: 1, airingAt }] }, now), undefined);
  }
  assert.equal(recentImpressionAiring(undefined, now), undefined);
  assert.equal(recentImpressionAiring({ nextEpisode: { episode: 1, airingAt: new Date(now).toISOString() } }, now), undefined);
  assert.equal(recentImpressionAiring({ recentEpisodes: [{ episode: 1, airingAt: "bad" }, { episode: 2, airingAt: new Date(now).toISOString() }] }, now), new Date(now).toISOString());
});

test("full 94-title search and non-mutating pages of at most ten; saved order is updatedAt descending", () => {
  const records = [record(0), record(1, { updatedAt: "2026-10-02T00:00:00Z" })];
  assert.deepEqual(sortImpressionRecords(records).map((r) => r.anime.id), ["anilist-2", "anilist-1"]);
  assert.equal(searchImpressionCatalog(catalog, records, "").items.length, 10);
  assert.equal(searchImpressionCatalog(catalog, records, "").total, 94);
  for (const item of catalog) assert.equal(searchImpressionCatalog(catalog, records, item.title).items[0].id, item.id);
  const ids = new Set(Array.from({ length: 10 }, (_, page) => searchImpressionCatalog(catalog, records, "", "all", page).items).flat().map((item) => item.id));
  assert.equal(ids.size, 94);
  assert.deepEqual(searchImpressionCatalog(catalog, records, "", "saved").items.map((item) => item.id), ["anilist-2", "anilist-1"]);
  assert.equal(searchImpressionCatalog(catalog, records, "", "unchecked").total, 92);
  assert.equal(searchImpressionCatalog(catalog, records, "missing").total, 0);
  assert.equal(catalog[0].id, "anilist-1");
});

test("note edits reset no-spoiler; rating-only changes preserve it; growth copies use successful records", () => {
  const previous = record(0, { note: "大好き😀\n余韻", spoiler: "no_spoiler" });
  assert.equal(changeImpressionInput(previous, { note: "書き直し" }).spoiler, "unspecified");
  assert.equal(changeImpressionInput(previous, { note: null }).spoiler, "unspecified");
  assert.equal(changeImpressionInput(previous, { note: previous.note }).spoiler, "no_spoiler");
  assert.equal(changeImpressionInput(previous, { rating: "liked" }).spoiler, "no_spoiler");
  assert.equal(impressionGrowthCopy(undefined, previous, 0), "今期カードに、最初の1作品が加わりました。");
  assert.equal(impressionGrowthCopy(undefined, previous, 2), "今期カードに1作品加わりました。");
  assert.equal(impressionGrowthCopy(previous, { ...previous, note: "更新" }, 1), "今の一言に更新しました。");
  assert.equal(impressionGrowthCopy(previous, { ...previous, rating: "liked" }, 1), "記録を更新しました。");
});

test("airing remains outside persisted and public snapshots; independent rating/note privacy matrix", () => {
  const anime = readImpressionAnime({ ...catalog[0], airing: { recentEpisodes: [{ episode: 1, airingAt: new Date(now).toISOString() }] } })!;
  assert.deepEqual(Object.keys(anime).sort(), ["id", "imageUrl", "source", "title"]);
  for (const spoiler of ["unspecified", "no_spoiler", "has_spoiler"] as const) for (const includeNote of [false, true]) for (const includeRating of [false, true]) {
    const snapshot = buildImpressionSnapshot({ kind: "season-impressions", year: 2026, season: "FALL", selections: [{ animeId: anime.id, revision: 1, includeNote, includeRating }] }, [record(0, { anime, note: "PRIVATE", rating: "liked", spoiler })])!;
    assert.equal(snapshot.items[0].note, includeNote && spoiler === "no_spoiler" ? "PRIVATE" : undefined);
    assert.equal(snapshot.items[0].rating, includeRating ? "liked" : undefined);
    assert.doesNotMatch(JSON.stringify(snapshot), /airing|updatedAt|checkedAt|spoiler|revision/);
  }
});

test("typed analytics runtime allowlist contains only enums/aggregate fields and production is no-op", () => {
  const events: ImpressionAnalyticsEvent[] = [
    { name: "impression_view", view: "entry", count: 3 }, { name: "impression_edit", source: "card" }, { name: "impression_skip" },
    { name: "impression_save", outcome: "unknown", operation: "edit" }, { name: "impression_share", action: "preview", count: 6 }
  ];
  for (const event of events) assert.deepEqual(sanitizeImpressionAnalytics({ ...event, body: "PRIVATE", search: "PRIVATE", title: "PRIVATE", animeId: "PRIVATE", userId: "PRIVATE", shareId: "PRIVATE", url: "PRIVATE", token: "PRIVATE", error: "PRIVATE" }), event);
  for (const event of [{ name: "impression_unknown" }, { name: "impression_view", view: "PRIVATE", count: 1 }, { name: "impression_view", view: "entry", count: Infinity }, { name: "impression_share", action: "preview", count: -1 }, { name: "impression_edit", source: "PRIVATE" }]) assert.equal(sanitizeImpressionAnalytics(event), null);
  const priorEnv = process.env.NODE_ENV;
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const original = console.debug;
  let calls = 0;
  try {
    process.env.NODE_ENV = "production";
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    console.debug = () => { calls++; };
    for (const event of events) track(event);
    assert.equal(calls, 0);
  } finally {
    console.debug = original;
    if (priorEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorEnv;
    if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});
