import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnimeStatusRecord, ViewingStatus } from "../lib/statuses.ts";
import type { AnimeItem, StreamingProvider } from "../lib/types.ts";
import { rankNextActions } from "../lib/home-next-actions.ts";
import {
  buildNextActionCandidates,
  type BuildNextActionCandidatesOptions,
  type HomeAnimeSnapshot
} from "../lib/home-next-action-candidates.ts";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const NOW_MS = NOW.getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function makeAnime(id: string, overrides: Partial<AnimeItem> = {}): AnimeItem {
  return {
    id,
    source: "anilist",
    title: `Anime ${id}`,
    titles: { userPreferred: `Anime ${id}` },
    imageUrl: `https://example.com/${id}.jpg`,
    proxiedImageUrl: `/api/image-proxy?url=${id}`,
    siteUrl: `https://anilist.co/anime/${id}`,
    ...overrides
  };
}

function makeRecord(input: {
  animeId: string;
  status?: ViewingStatus;
  updatedAt?: string;
  watchedEpisodes?: number | null;
  anime?: AnimeItem | null;
  notes?: string | null;
}): AnimeStatusRecord {
  return {
    animeId: input.animeId,
    status: input.status ?? "watching",
    anime: input.anime === undefined ? makeAnime(input.animeId) : input.anime,
    favoriteLevel: null,
    watchSlot: null,
    notes: input.notes === undefined ? null : input.notes,
    watchRhythm: null,
    watchedEpisodes: input.watchedEpisodes === undefined ? null : input.watchedEpisodes,
    updatedAt: input.updatedAt ?? "2026-07-01T00:00:00.000Z"
  };
}

function freshSnapshot(items: readonly AnimeItem[]): HomeAnimeSnapshot {
  return { freshness: "fresh", items };
}

function staleSnapshot(items: readonly AnimeItem[]): HomeAnimeSnapshot {
  return { freshness: "stale", items };
}

const UNAVAILABLE: HomeAnimeSnapshot = { freshness: "unavailable", items: null };

function options(
  overrides: Partial<BuildNextActionCandidatesOptions> = {}
): BuildNextActionCandidatesOptions {
  return {
    now: NOW,
    seasonal: UNAVAILABLE,
    streaming: UNAVAILABLE,
    ...overrides
  };
}

function airingAtOffset(offsetMs: number): string {
  return new Date(NOW_MS + offsetMs).toISOString();
}

test("AC1: fresh same-ID seasonal overlays saved anime, confirms availability, and feeds A1", () => {
  const saved = makeAnime("a1", {
    title: "Saved Title",
    notes: undefined,
    airing: {
      recentEpisodes: [{ episode: 2, airingAt: airingAtOffset(-DAY_MS) }]
    }
  });
  const record = makeRecord({
    animeId: "a1",
    status: "watching",
    watchedEpisodes: 1,
    anime: saved,
    notes: "個人メモ"
  });
  const seasonalItem = makeAnime("a1", {
    title: "Seasonal Title",
    airing: {
      recentEpisodes: [{ episode: 4, airingAt: airingAtOffset(-2 * DAY_MS) }],
      nextEpisode: { episode: 5, airingAt: airingAtOffset(DAY_MS) }
    }
  });

  const frozenSaved = Object.freeze({ ...saved });
  const frozenSeasonal = Object.freeze({ ...seasonalItem });
  const frozenRecord = Object.freeze({
    ...record,
    anime: frozenSaved
  });
  const seasonalItems = Object.freeze([frozenSeasonal]);

  const candidates = buildNextActionCandidates([frozenRecord], options({
    seasonal: freshSnapshot(seasonalItems)
  }));

  assert.equal(candidates.length, 1);
  const candidate = candidates[0];
  assert.notEqual(candidate.record, frozenRecord);
  assert.notEqual(candidate.record.anime, frozenSaved);
  assert.notEqual(candidate.record.anime, frozenSeasonal);
  assert.equal(candidate.record.anime?.title, "Seasonal Title");
  assert.equal(candidate.record.notes, "個人メモ");
  assert.equal(candidate.latestAvailableEpisode, 4);
  assert.equal(candidate.availabilityConfidence, "confirmed");
  assert.equal(frozenSaved.title, "Saved Title");
  assert.equal(frozenSeasonal.title, "Seasonal Title");

  const ranked = rankNextActions(candidates, { now: NOW });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].anime.title, "Seasonal Title");
  assert.equal(ranked[0].latestAvailableEpisode, 4);
  assert.equal(ranked[0].availabilityConfidence, "confirmed");
  assert.equal(ranked[0].unwatchedEpisodes, 3);
});

test("AC2: stale same-ID seasonal derives the same episode as estimated, never confirmed", () => {
  const record = makeRecord({
    animeId: "s1",
    watchedEpisodes: 1,
    anime: makeAnime("s1", {
      airing: {
        recentEpisodes: [{ episode: 3, airingAt: airingAtOffset(-DAY_MS) }]
      }
    })
  });
  const seasonalItem = makeAnime("s1", {
    airing: {
      recentEpisodes: [{ episode: 6, airingAt: airingAtOffset(-3 * DAY_MS) }]
    }
  });

  const candidates = buildNextActionCandidates([record], options({
    seasonal: staleSnapshot([seasonalItem])
  }));

  assert.equal(candidates[0].latestAvailableEpisode, 6);
  assert.equal(candidates[0].availabilityConfidence, "estimated");
  assert.notEqual(candidates[0].availabilityConfidence, "confirmed");
});

test("AC3: unavailable or unmatched seasonal preserves saved records with estimated or unknown", () => {
  const withAiring = makeRecord({
    animeId: "saved-ok",
    anime: makeAnime("saved-ok", {
      airing: {
        recentEpisodes: [{ episode: 3, airingAt: airingAtOffset(-DAY_MS) }]
      }
    })
  });
  const withoutAiring = makeRecord({
    animeId: "saved-empty",
    anime: makeAnime("saved-empty")
  });
  const unmatched = makeRecord({
    animeId: "local-only",
    anime: makeAnime("local-only", {
      airing: {
        nextEpisode: { episode: 2, airingAt: airingAtOffset(DAY_MS) }
      }
    })
  });
  const otherSeasonal = makeAnime("other", {
    airing: {
      recentEpisodes: [{ episode: 99, airingAt: airingAtOffset(-DAY_MS) }]
    }
  });

  const unavailable = buildNextActionCandidates(
    [withAiring, withoutAiring],
    options({ seasonal: UNAVAILABLE })
  );
  assert.equal(unavailable[0].record, withAiring);
  assert.equal(unavailable[0].latestAvailableEpisode, 3);
  assert.equal(unavailable[0].availabilityConfidence, "estimated");
  assert.equal(unavailable[1].record, withoutAiring);
  assert.equal(unavailable[1].latestAvailableEpisode, null);
  assert.equal(unavailable[1].availabilityConfidence, "unknown");

  const unmatchedResult = buildNextActionCandidates(
    [unmatched],
    options({ seasonal: freshSnapshot([otherSeasonal]) })
  );
  assert.equal(unmatchedResult[0].record, unmatched);
  assert.equal(unmatchedResult[0].latestAvailableEpisode, 1);
  assert.equal(unmatchedResult[0].availabilityConfidence, "estimated");
});

test("AC4: max eligible episode across recent and next-1 with exact now and seven-day bounds", () => {
  const anime = makeAnime("bounds", {
    airing: {
      recentEpisodes: [
        { episode: 5, airingAt: airingAtOffset(0) },
        { episode: 4, airingAt: airingAtOffset(-WEEK_MS) },
        { episode: 3, airingAt: airingAtOffset(-(WEEK_MS + 1)) },
        { episode: 10, airingAt: airingAtOffset(1) }
      ],
      nextEpisode: { episode: 8, airingAt: airingAtOffset(DAY_MS) }
    }
  });
  const record = makeRecord({ animeId: "bounds", anime });

  const candidates = buildNextActionCandidates([record], options());
  // recent: ep5 at now, ep4 at week boundary; future ep10 ignored; next-1 => 7
  assert.equal(candidates[0].latestAvailableEpisode, 7);
  assert.equal(candidates[0].likelyNewEpisodeThisWeek, true);

  const onlyLowerEdge = makeRecord({
    animeId: "lower",
    anime: makeAnime("lower", {
      airing: {
        recentEpisodes: [{ episode: 2, airingAt: airingAtOffset(-WEEK_MS) }]
      }
    })
  });
  const lower = buildNextActionCandidates([onlyLowerEdge], options());
  assert.equal(lower[0].latestAvailableEpisode, 2);
  assert.equal(lower[0].likelyNewEpisodeThisWeek, true);

  const justBefore = makeRecord({
    animeId: "before",
    anime: makeAnime("before", {
      airing: {
        recentEpisodes: [{ episode: 2, airingAt: airingAtOffset(-(WEEK_MS + 1)) }]
      }
    })
  });
  const before = buildNextActionCandidates([justBefore], options());
  assert.equal(before[0].latestAvailableEpisode, 2);
  assert.equal(before[0].likelyNewEpisodeThisWeek, false);

  const nextOnly = makeRecord({
    animeId: "next1",
    anime: makeAnime("next1", {
      airing: {
        nextEpisode: { episode: 1, airingAt: airingAtOffset(DAY_MS) }
      }
    })
  });
  const next1 = buildNextActionCandidates([nextOnly], options());
  assert.equal(next1[0].latestAvailableEpisode, 0);
  assert.equal(next1[0].availabilityConfidence, "estimated");
});

test("AC5: invalid now, malformed dates, non-integer and future sources cannot produce availability", () => {
  const anime = makeAnime("bad", {
    airing: {
      recentEpisodes: [
        { episode: 2.5, airingAt: airingAtOffset(-DAY_MS) },
        { episode: 0, airingAt: airingAtOffset(-DAY_MS) },
        { episode: -1, airingAt: airingAtOffset(-DAY_MS) },
        { episode: 4, airingAt: "not-a-date" },
        { episode: 5, airingAt: airingAtOffset(DAY_MS) }
      ],
      nextEpisode: { episode: 3, airingAt: "also-bad" }
    }
  });
  const record = makeRecord({ animeId: "bad", anime });

  const invalidNow = buildNextActionCandidates(
    [record],
    options({ now: new Date(Number.NaN) })
  );
  assert.equal(invalidNow[0].latestAvailableEpisode, null);
  assert.equal(invalidNow[0].availabilityConfidence, "unknown");
  assert.equal(invalidNow[0].likelyNewEpisodeThisWeek, false);

  const validNow = buildNextActionCandidates([record], options());
  assert.equal(validNow[0].latestAvailableEpisode, null);
  assert.equal(validNow[0].availabilityConfidence, "unknown");
  assert.equal(validNow[0].likelyNewEpisodeThisWeek, false);
});

test("AC6: streaming provider is independent of seasonal freshness and stable under reordering", () => {
  const netflix: StreamingProvider = { id: 8, name: "Netflix", logoUrl: null };
  const crunchy: StreamingProvider = { id: 2, name: "Crunchyroll", logoUrl: "/c.png" };
  const amazon: StreamingProvider = { id: 2, name: "Amazon", logoUrl: "/a.png" };

  const streamingItem = makeAnime("p1", {
    streamingProvidersJp: {
      flatrate: [netflix, crunchy, amazon]
    }
  });
  const reordered = makeAnime("p1", {
    streamingProvidersJp: {
      flatrate: [amazon, netflix, crunchy]
    }
  });
  const record = makeRecord({ animeId: "p1" });

  const freshProviders = buildNextActionCandidates([record], options({
    streaming: freshSnapshot([streamingItem]),
    seasonal: UNAVAILABLE
  }));
  const staleProviders = buildNextActionCandidates([record], options({
    streaming: staleSnapshot([reordered]),
    seasonal: freshSnapshot([
      makeAnime("p1", {
        airing: {
          recentEpisodes: [{ episode: 2, airingAt: airingAtOffset(-DAY_MS) }]
        }
      })
    ])
  }));
  const unavailableProviders = buildNextActionCandidates([record], options({
    streaming: UNAVAILABLE
  }));

  assert.equal(freshProviders[0].provider, amazon);
  assert.equal(staleProviders[0].provider, amazon);
  assert.equal(staleProviders[0].availabilityConfidence, "confirmed");
  assert.equal(staleProviders[0].provider?.name, "Amazon");
  assert.equal(unavailableProviders[0].provider, null);
  assert.deepEqual(streamingItem.streamingProvidersJp?.flatrate.map((p) => p.id), [8, 2, 2]);
  assert.deepEqual(reordered.streamingProvidersJp?.flatrate.map((p) => p.name), [
    "Amazon",
    "Netflix",
    "Crunchyroll"
  ]);

  const emptyFlatrate = buildNextActionCandidates([record], options({
    streaming: freshSnapshot([
      makeAnime("p1", { streamingProvidersJp: { flatrate: [] } })
    ])
  }));
  assert.equal(emptyFlatrate[0].provider, null);
});

test("AC7: first duplicate wins; order and ineligible statuses are preserved", () => {
  const first = makeAnime("dup", {
    title: "First",
    airing: {
      recentEpisodes: [{ episode: 3, airingAt: airingAtOffset(-DAY_MS) }]
    }
  });
  const second = makeAnime("dup", {
    title: "Second",
    airing: {
      recentEpisodes: [{ episode: 9, airingAt: airingAtOffset(-DAY_MS) }]
    }
  });
  const records = [
    makeRecord({ animeId: "dup", status: "completed", anime: makeAnime("dup") }),
    makeRecord({ animeId: "dup", status: "dropped", anime: null }),
    makeRecord({ animeId: "x", status: "watching", anime: makeAnime("x") })
  ];

  const candidates = buildNextActionCandidates(records, options({
    seasonal: freshSnapshot([first, second])
  }));

  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].record.status, "completed");
  assert.equal(candidates[0].record.anime?.title, "First");
  assert.equal(candidates[0].latestAvailableEpisode, 3);
  // anime:null is not synthesized even when seasonal same-ID exists
  assert.equal(candidates[1].record, records[1]);
  assert.equal(candidates[1].record.anime, null);
  assert.equal(candidates[1].latestAvailableEpisode, 3);
  assert.equal(candidates[1].availabilityConfidence, "confirmed");
  assert.equal(candidates[2].record, records[2]);
  assert.equal(candidates[2].latestAvailableEpisode, null);
});

test("AC8: frozen inputs remain unchanged and identities are preserved when possible", () => {
  const providerA: StreamingProvider = { id: 1, name: "A", logoUrl: null };
  const providerB: StreamingProvider = { id: 3, name: "B", logoUrl: null };
  const flatrate = Object.freeze([providerA, providerB]);
  const recent = Object.freeze([
    Object.freeze({ episode: 2, airingAt: airingAtOffset(-DAY_MS) })
  ]);
  const saved = Object.freeze(
    makeAnime("id1", {
      airing: Object.freeze({ recentEpisodes: recent })
    })
  );
  const streamingItem = Object.freeze(
    makeAnime("id1", {
      streamingProvidersJp: Object.freeze({ flatrate })
    })
  );
  const record = Object.freeze(
    makeRecord({
      animeId: "id1",
      anime: saved,
      status: "planned"
    })
  );
  const records = Object.freeze([record]);
  const seasonalItems = Object.freeze([
    Object.freeze(
      makeAnime("other", {
        airing: {
          recentEpisodes: [{ episode: 5, airingAt: airingAtOffset(-DAY_MS) }]
        }
      })
    )
  ]);
  const streamingItems = Object.freeze([streamingItem]);

  const candidates = buildNextActionCandidates(records, options({
    seasonal: freshSnapshot(seasonalItems),
    streaming: freshSnapshot(streamingItems)
  }));

  assert.equal(candidates[0].record, record);
  assert.equal(candidates[0].provider, providerA);
  assert.equal(saved.airing?.recentEpisodes?.length, 1);
  assert.equal(flatrate[0], providerA);
  assert.equal(flatrate[1], providerB);
  assert.equal(records.length, 1);
  assert.equal(seasonalItems.length, 1);
});

test("AC9: pure helper is deterministic and free of implicit clock access", () => {
  const record = makeRecord({
    animeId: "pure",
    anime: makeAnime("pure", {
      airing: {
        recentEpisodes: [{ episode: 2, airingAt: airingAtOffset(-DAY_MS) }],
        nextEpisode: { episode: 3, airingAt: airingAtOffset(DAY_MS) }
      }
    })
  });
  const provider: StreamingProvider = { id: 4, name: "D", logoUrl: null };
  const streaming = makeAnime("pure", {
    streamingProvidersJp: { flatrate: [provider] }
  });
  const opts = options({
    seasonal: staleSnapshot([
      makeAnime("pure", {
        title: "純関数タイトル",
        airing: {
          recentEpisodes: [{ episode: 2, airingAt: airingAtOffset(-DAY_MS) }]
        }
      })
    ]),
    streaming: freshSnapshot([streaming])
  });

  const first = buildNextActionCandidates([record], opts);
  const second = buildNextActionCandidates([record], opts);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first[0].availabilityConfidence, "estimated");
  assert.equal(first[0].provider, provider);
  assert.equal(first[0].record.anime?.title, "純関数タイトル");
});
