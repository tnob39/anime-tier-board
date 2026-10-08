import assert from "node:assert/strict";
import test from "node:test";
import { calcSubscriptionStats } from "../lib/subscription-stats";
import type { AnimeItem } from "../lib/types";

function anime(id: string, providers?: number[]): AnimeItem {
  const item: AnimeItem = {
    id,
    source: "anilist",
    title: id,
    titles: {},
    imageUrl: "",
    proxiedImageUrl: "",
    siteUrl: ""
  };
  if (providers) {
    item.streamingProvidersJp = {
      flatrate: providers.map((providerId) => ({ id: providerId, name: String(providerId), logoUrl: null }))
    };
  }
  return item;
}

test("coverage denominator excludes anime with unknown provider data", () => {
  const stats = calcSubscriptionStats(
    [anime("covered", [8]), anime("confirmed-uncovered", []), anime("unknown")],
    [{ serviceId: "netflix", createdAt: "2026-10-08T00:00:00.000Z" }]
  );

  assert.equal(stats.watchlistCount, 3);
  assert.equal(stats.confirmedCount, 2);
  assert.equal(stats.unknownCount, 1);
  assert.equal(stats.coveredCount, 1);
  assert.equal(stats.coveragePercentage, 50);
  assert.deepEqual(stats.uncoveredAnime.map((item) => item.id), ["confirmed-uncovered"]);
  assert.deepEqual(stats.unknownAnime.map((item) => item.id), ["unknown"]);
});

test("unverified AniList fallback does not turn unknown data into confirmed coverage", () => {
  const unknown = anime("unknown-fallback");
  unknown.streamingPlatforms = [{ name: "Netflix", url: "https://example.invalid" }];
  const stats = calcSubscriptionStats(
    [unknown],
    [{ serviceId: "netflix", createdAt: "2026-10-08T00:00:00.000Z" }]
  );
  assert.equal(stats.confirmedCount, 0);
  assert.equal(stats.coveredCount, 0);
  assert.equal(stats.coveragePercentage, 0);
  assert.equal(stats.unknownCount, 1);
});
