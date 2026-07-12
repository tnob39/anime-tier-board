import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnimeStatusRecord, ViewingStatus } from "../lib/statuses.ts";
import type { AnimeItem } from "../lib/types.ts";
import type { HomeAnimeSnapshot } from "../lib/home-next-action-candidates.ts";
import {
  buildHomeWeek,
  type BuildHomeWeekOptions,
  type HomeWeekItem
} from "../lib/home-week.ts";

/** 2026-07-12T12:00:00.000Z = 2026-07-12 21:00 JST (Sunday) */
const NOW = new Date("2026-07-12T12:00:00.000Z");
const NOW_MS = NOW.getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

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
  favoriteLevel?: number | null;
  notes?: string | null;
}): AnimeStatusRecord {
  return {
    animeId: input.animeId,
    status: input.status ?? "watching",
    anime: input.anime === undefined ? makeAnime(input.animeId) : input.anime,
    favoriteLevel: input.favoriteLevel === undefined ? null : input.favoriteLevel,
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

function options(overrides: Partial<BuildHomeWeekOptions> = {}): BuildHomeWeekOptions {
  return {
    now: NOW,
    seasonal: UNAVAILABLE,
    ...overrides
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Fixed ISO instants whose JST weekdays are known under NOW.
 * Mon 2026-07-13 15:00 JST = 2026-07-13T06:00:00.000Z (~0.75d ahead)
 * Tue 2026-07-14 15:00 JST = 2026-07-14T06:00:00.000Z
 * Wed 2026-07-15 15:00 JST = 2026-07-15T06:00:00.000Z
 * Thu 2026-07-16 15:00 JST = 2026-07-16T06:00:00.000Z
 * Fri 2026-07-17 15:00 JST = 2026-07-17T06:00:00.000Z
 * Sat 2026-07-18 15:00 JST = 2026-07-18T06:00:00.000Z
 * Sun 2026-07-19 15:00 JST = 2026-07-19T06:00:00.000Z (~6.75d ahead, still airing)
 * Mon 2026-07-27 15:00 JST = 2026-07-27T06:00:00.000Z (~14.75d, upcoming)
 * Stale past: 2026-07-10T06:00:00.000Z (~2.25d before NOW, outside -1d window)
 */
const AIRING_MON = "2026-07-13T06:00:00.000Z";
const AIRING_TUE = "2026-07-14T06:00:00.000Z";
const AIRING_WED = "2026-07-15T06:00:00.000Z";
const AIRING_THU = "2026-07-16T06:00:00.000Z";
const AIRING_FRI = "2026-07-17T06:00:00.000Z";
const AIRING_SAT = "2026-07-18T06:00:00.000Z";
const AIRING_SUN = "2026-07-19T06:00:00.000Z";
const UPCOMING_MON = "2026-07-27T06:00:00.000Z";
const STALE_PAST = "2026-07-10T06:00:00.000Z";

function withNextEpisode(id: string, airingAt: string, episode = 3): AnimeItem {
  return makeAnime(id, {
    airing: {
      nextEpisode: { episode, airingAt }
    }
  });
}

function withBroadcastDay(id: string, broadcastDay: string): AnimeItem {
  return makeAnime(id, {
    airing: { broadcastDay }
  });
}

test("AC1: exports buildHomeWeek with readonly records and exact HomeWeekItem shape", () => {
  const records: readonly AnimeStatusRecord[] = Object.freeze([
    makeRecord({
      animeId: "shape-1",
      status: "planned",
      watchedEpisodes: 2,
      updatedAt: "2026-06-01T00:00:00.000Z",
      anime: withNextEpisode("shape-1", AIRING_MON)
    })
  ]);

  const result = buildHomeWeek(records, options());
  assert.equal(result.length, 1);
  const item: HomeWeekItem = result[0];
  assert.deepEqual(item, {
    anime: withNextEpisode("shape-1", AIRING_MON),
    status: "planned",
    watchedEpisodes: 2,
    weekday: "月",
    state: "airing",
    startLabel: null,
    updatedAt: "2026-06-01T00:00:00.000Z"
  });
});

test("AC2: only watching/planned with non-null anime are emitted", () => {
  const watching = makeRecord({
    animeId: "w1",
    status: "watching",
    watchedEpisodes: 1,
    anime: withNextEpisode("w1", AIRING_MON)
  });
  const planned = makeRecord({
    animeId: "p1",
    status: "planned",
    watchedEpisodes: null,
    anime: withNextEpisode("p1", AIRING_TUE)
  });
  const completed = makeRecord({
    animeId: "c1",
    status: "completed",
    anime: withNextEpisode("c1", AIRING_WED)
  });
  const paused = makeRecord({
    animeId: "pa1",
    status: "paused",
    anime: withNextEpisode("pa1", AIRING_THU)
  });
  const dropped = makeRecord({
    animeId: "d1",
    status: "dropped",
    anime: withNextEpisode("d1", AIRING_FRI)
  });
  const nullAnime = makeRecord({
    animeId: "n1",
    status: "watching",
    anime: null
  });
  const unknownStatus = {
    ...makeRecord({
      animeId: "u1",
      anime: withNextEpisode("u1", AIRING_SAT)
    }),
    status: "unknown" as ViewingStatus
  };

  const result = buildHomeWeek(
    [completed, paused, dropped, nullAnime, unknownStatus, watching, planned],
    options()
  );

  assert.deepEqual(result, [
    {
      anime: withNextEpisode("w1", AIRING_MON),
      status: "watching",
      watchedEpisodes: 1,
      weekday: "月",
      state: "airing",
      startLabel: null,
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    {
      anime: withNextEpisode("p1", AIRING_TUE),
      status: "planned",
      watchedEpisodes: null,
      weekday: "火",
      state: "airing",
      startLabel: null,
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  ]);
});

test("AC3: flat Monday-through-Sunday order; empty weekdays produce no entries", () => {
  const fri = makeRecord({
    animeId: "fri",
    anime: withNextEpisode("fri", AIRING_FRI)
  });
  const mon = makeRecord({
    animeId: "mon",
    anime: withNextEpisode("mon", AIRING_MON)
  });
  const sun = makeRecord({
    animeId: "sun",
    anime: withNextEpisode("sun", AIRING_SUN)
  });
  const wed = makeRecord({
    animeId: "wed",
    anime: withNextEpisode("wed", AIRING_WED)
  });

  const result = buildHomeWeek([fri, mon, sun, wed], options());
  assert.deepEqual(
    result.map((item) => ({ id: item.anime.id, weekday: item.weekday })),
    [
      { id: "mon", weekday: "月" },
      { id: "wed", weekday: "水" },
      { id: "fri", weekday: "金" },
      { id: "sun", weekday: "日" }
    ]
  );
  assert.equal(result.some((item) => item.weekday === "火"), false);
  assert.equal(result.some((item) => item.weekday === "木"), false);
  assert.equal(result.some((item) => item.weekday === "土"), false);
});

test("AC4: fixed now proves airing, upcoming, stale omission, broadcastDay fallback, startLabel", () => {
  const airingSoon = makeRecord({
    animeId: "airing",
    anime: withNextEpisode("airing", AIRING_MON)
  });
  const upcoming = makeRecord({
    animeId: "upcoming",
    anime: withNextEpisode("upcoming", UPCOMING_MON)
  });
  const stale = makeRecord({
    animeId: "stale",
    anime: withNextEpisode("stale", STALE_PAST)
  });
  const fallback = makeRecord({
    animeId: "fallback",
    anime: withBroadcastDay("fallback", "Wednesday")
  });
  const pastBoundaryAiring = makeRecord({
    animeId: "past-ok",
    // slightly less than 1 day past → still airing
    anime: withNextEpisode("past-ok", new Date(NOW_MS - DAY_MS + 60_000).toISOString())
  });

  const result = buildHomeWeek(
    [stale, upcoming, airingSoon, fallback, pastBoundaryAiring],
    options()
  );

  assert.deepEqual(result, [
    {
      anime: withNextEpisode("airing", AIRING_MON),
      status: "watching",
      watchedEpisodes: null,
      weekday: "月",
      state: "airing",
      startLabel: null,
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    {
      anime: withNextEpisode("upcoming", UPCOMING_MON),
      status: "watching",
      watchedEpisodes: null,
      weekday: "月",
      state: "upcoming",
      startLabel: "7/27",
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    {
      anime: withBroadcastDay("fallback", "Wednesday"),
      status: "watching",
      watchedEpisodes: null,
      weekday: "水",
      state: "airing",
      startLabel: null,
      updatedAt: "2026-07-01T00:00:00.000Z"
    },
    {
      anime: withNextEpisode("past-ok", new Date(NOW_MS - DAY_MS + 60_000).toISOString()),
      status: "watching",
      watchedEpisodes: null,
      weekday: "土",
      state: "airing",
      startLabel: null,
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  ]);
});

test("AC5: fresh seasonal replaces only airing; other saved fields and status fields stay intact", () => {
  const savedAiring = {
    nextEpisode: { episode: 2, airingAt: AIRING_TUE },
    broadcastDay: "Tuesday"
  };
  const savedAnime = makeAnime("enr-1", {
    title: "保存タイトル",
    score: 77,
    genres: ["Action"],
    airing: savedAiring
  });
  const record = makeRecord({
    animeId: "enr-1",
    status: "planned",
    watchedEpisodes: 4,
    favoriteLevel: 3,
    notes: "個人メモ",
    updatedAt: "2026-05-01T00:00:00.000Z",
    anime: savedAnime
  });
  const seasonalItem = makeAnime("enr-1", {
    title: "季節タイトル",
    score: 99,
    genres: ["Comedy"],
    airing: {
      nextEpisode: { episode: 5, airingAt: AIRING_FRI },
      broadcastDay: "Friday"
    }
  });

  const result = buildHomeWeek([record], options({ seasonal: freshSnapshot([seasonalItem]) }));

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    anime: {
      ...savedAnime,
      airing: {
        nextEpisode: { episode: 5, airingAt: AIRING_FRI },
        broadcastDay: "Friday"
      }
    },
    status: "planned",
    watchedEpisodes: 4,
    weekday: "金",
    state: "airing",
    startLabel: null,
    updatedAt: "2026-05-01T00:00:00.000Z"
  });
  assert.equal(result[0].anime.title, "保存タイトル");
  assert.equal(result[0].anime.score, 77);
  assert.deepEqual(result[0].anime.genres, ["Action"]);
  assert.equal(result[0].status, "planned");
  assert.equal(result[0].watchedEpisodes, 4);
});

test("AC6: stale seasonal enriches like fresh; unavailable falls back to saved airing", () => {
  const savedAnime = makeAnime("stale-enr", {
    title: "保存",
    airing: {
      nextEpisode: { episode: 1, airingAt: AIRING_MON }
    }
  });
  const record = makeRecord({
    animeId: "stale-enr",
    status: "watching",
    watchedEpisodes: 0,
    anime: savedAnime
  });
  const seasonalItem = makeAnime("stale-enr", {
    title: "季節",
    airing: {
      nextEpisode: { episode: 8, airingAt: AIRING_THU }
    }
  });

  const staleResult = buildHomeWeek(
    [record],
    options({ seasonal: staleSnapshot([seasonalItem]) })
  );
  assert.deepEqual(staleResult, [
    {
      anime: {
        ...savedAnime,
        airing: {
          nextEpisode: { episode: 8, airingAt: AIRING_THU }
        }
      },
      status: "watching",
      watchedEpisodes: 0,
      weekday: "木",
      state: "airing",
      startLabel: null,
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  ]);

  const unavailableResult = buildHomeWeek([record], options({ seasonal: UNAVAILABLE }));
  assert.deepEqual(unavailableResult, [
    {
      anime: savedAnime,
      status: "watching",
      watchedEpisodes: 0,
      weekday: "月",
      state: "airing",
      startLabel: null,
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  ]);
  assert.equal(unavailableResult[0].anime, savedAnime);
});

test("AC7: first seasonal ID wins; null/missing first airing does not erase saved airing", () => {
  const savedAiring = {
    nextEpisode: { episode: 3, airingAt: AIRING_WED }
  };
  const saved = makeAnime("dup-1", {
    title: "保存",
    airing: savedAiring
  });
  const record = makeRecord({
    animeId: "dup-1",
    anime: saved
  });

  const firstNull = makeAnime("dup-1", {
    title: "first-null",
    airing: null
  });
  const secondWithAiring = makeAnime("dup-1", {
    title: "second",
    airing: {
      nextEpisode: { episode: 9, airingAt: AIRING_FRI }
    }
  });

  const nullFirst = buildHomeWeek(
    [record],
    options({ seasonal: freshSnapshot([firstNull, secondWithAiring]) })
  );
  assert.deepEqual(nullFirst, [
    {
      anime: saved,
      status: "watching",
      watchedEpisodes: null,
      weekday: "水",
      state: "airing",
      startLabel: null,
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  ]);
  assert.equal(nullFirst[0].anime.airing, savedAiring);

  const firstMissing = makeAnime("dup-1", { title: "first-missing" });
  const missingFirst = buildHomeWeek(
    [record],
    options({ seasonal: freshSnapshot([firstMissing, secondWithAiring]) })
  );
  assert.equal(missingFirst[0].anime.airing, savedAiring);
  assert.equal(missingFirst[0].weekday, "水");

  const firstWins = makeAnime("dup-1", {
    title: "first-wins",
    airing: {
      nextEpisode: { episode: 4, airingAt: AIRING_SAT }
    }
  });
  const laterIgnored = makeAnime("dup-1", {
    title: "later",
    airing: {
      nextEpisode: { episode: 99, airingAt: AIRING_SUN }
    }
  });
  const win = buildHomeWeek(
    [record],
    options({ seasonal: freshSnapshot([firstWins, laterIgnored]) })
  );
  assert.equal(win[0].weekday, "土");
  assert.deepEqual(win[0].anime.airing, {
    nextEpisode: { episode: 4, airingAt: AIRING_SAT }
  });
  assert.equal(win[0].anime.title, "保存");
});

test("AC8: same-day ordering by state, airingAt, anime.id, then updatedAt desc", () => {
  const upcomingEarly = makeRecord({
    animeId: "id-b",
    updatedAt: "2026-07-01T00:00:00.000Z",
    anime: withNextEpisode("id-b", UPCOMING_MON)
  });
  const upcomingLate = makeRecord({
    animeId: "id-a",
    updatedAt: "2026-07-02T00:00:00.000Z",
    anime: makeAnime("id-a", {
      airing: {
        nextEpisode: {
          episode: 1,
          airingAt: "2026-08-03T06:00:00.000Z"
        }
      }
    })
  });
  const airingLateId = makeRecord({
    animeId: "id-z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    anime: withNextEpisode("id-z", AIRING_MON)
  });
  const airingEarlyIdNewer = makeRecord({
    animeId: "id-m",
    updatedAt: "2026-07-05T00:00:00.000Z",
    anime: withNextEpisode("id-m", AIRING_MON)
  });
  const airingEarlyIdOlder = makeRecord({
    animeId: "id-m",
    updatedAt: "2026-07-03T00:00:00.000Z",
    anime: withNextEpisode("id-m", AIRING_MON)
  });
  // same airingAt and id, different updatedAt for final key
  const airingSameIdNewest = makeRecord({
    animeId: "id-same",
    updatedAt: "2026-07-09T00:00:00.000Z",
    anime: withNextEpisode("id-same", AIRING_MON)
  });
  const airingSameIdOldest = makeRecord({
    animeId: "id-same",
    updatedAt: "2026-07-02T00:00:00.000Z",
    anime: withNextEpisode("id-same", AIRING_MON)
  });

  const result = buildHomeWeek(
    [
      upcomingLate,
      airingSameIdOldest,
      upcomingEarly,
      airingLateId,
      airingEarlyIdOlder,
      airingSameIdNewest,
      airingEarlyIdNewer
    ],
    options()
  );

  assert.deepEqual(
    result.map((item) => ({
      id: item.anime.id,
      state: item.state,
      airingAt: item.anime.airing?.nextEpisode?.airingAt ?? null,
      updatedAt: item.updatedAt
    })),
    [
      {
        id: "id-m",
        state: "airing",
        airingAt: AIRING_MON,
        updatedAt: "2026-07-05T00:00:00.000Z"
      },
      {
        id: "id-m",
        state: "airing",
        airingAt: AIRING_MON,
        updatedAt: "2026-07-03T00:00:00.000Z"
      },
      {
        id: "id-same",
        state: "airing",
        airingAt: AIRING_MON,
        updatedAt: "2026-07-09T00:00:00.000Z"
      },
      {
        id: "id-same",
        state: "airing",
        airingAt: AIRING_MON,
        updatedAt: "2026-07-02T00:00:00.000Z"
      },
      {
        id: "id-z",
        state: "airing",
        airingAt: AIRING_MON,
        updatedAt: "2026-07-01T00:00:00.000Z"
      },
      {
        id: "id-b",
        state: "upcoming",
        airingAt: UPCOMING_MON,
        updatedAt: "2026-07-01T00:00:00.000Z"
      },
      {
        id: "id-a",
        state: "upcoming",
        airingAt: "2026-08-03T06:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z"
      }
    ]
  );
});

test("AC9: does not mutate records, nested anime, seasonal.items, or seasonal anime", () => {
  const savedAiring = {
    nextEpisode: { episode: 2, airingAt: AIRING_MON },
    broadcastDay: "Monday"
  };
  const savedAnime = makeAnime("mut-1", {
    title: "保存",
    airing: savedAiring
  });
  const record = makeRecord({
    animeId: "mut-1",
    status: "watching",
    watchedEpisodes: 1,
    anime: savedAnime
  });
  const seasonalAiring = {
    nextEpisode: { episode: 6, airingAt: AIRING_FRI },
    broadcastDay: "Friday"
  };
  const seasonalAnime = makeAnime("mut-1", {
    title: "季節",
    airing: seasonalAiring
  });
  const seasonalItems: AnimeItem[] = [seasonalAnime];
  const records: AnimeStatusRecord[] = [record];

  const beforeRecords = deepClone(records);
  const beforeSeasonal = deepClone(seasonalItems);
  const beforeSavedAnime = deepClone(savedAnime);
  const beforeSeasonalAnime = deepClone(seasonalAnime);

  const result = buildHomeWeek(
    records,
    options({ seasonal: freshSnapshot(seasonalItems) })
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].weekday, "金");
  assert.deepEqual(records, beforeRecords);
  assert.deepEqual(seasonalItems, beforeSeasonal);
  assert.deepEqual(savedAnime, beforeSavedAnime);
  assert.deepEqual(seasonalAnime, beforeSeasonalAnime);
  assert.equal(savedAnime.airing, savedAiring);
  assert.equal(seasonalAnime.airing, seasonalAiring);
  assert.notEqual(result[0].anime, savedAnime);
  assert.notEqual(result[0].anime, seasonalAnime);
});

test("AC10: invalid Date throws RangeError; no implicit current time", () => {
  const record = makeRecord({
    animeId: "inv-1",
    anime: withNextEpisode("inv-1", AIRING_MON)
  });

  assert.throws(
    () => buildHomeWeek([record], options({ now: new Date(Number.NaN) })),
    RangeError
  );
  assert.throws(
    () => buildHomeWeek([record], options({ now: new Date(Number.POSITIVE_INFINITY) })),
    RangeError
  );

  // Valid explicit now still works without reading the real clock for classification
  const explicit = buildHomeWeek(
    [record],
    options({ now: new Date("2026-07-12T12:00:00.000Z") })
  );
  assert.equal(explicit.length, 1);
  assert.equal(explicit[0].weekday, "月");
  assert.equal(explicit[0].state, "airing");
});
