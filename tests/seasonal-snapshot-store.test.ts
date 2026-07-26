import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
  createSeasonalAnimeSource,
  FRESH_MAX_AGE_MS,
  STALE_MAX_AGE_MS
} from "../lib/anime-sources/index.ts";
import {
  createSeasonalSnapshotStore,
  isCanonicalUtcTimestamp,
  parseSeasonalSnapshotKey,
  shouldReplace,
  type SeasonalSnapshotRecord,
  type SeasonalSnapshotStore,
  type SnapshotDbClient
} from "../lib/seasonal-snapshot-store.ts";
import type { AnimeItem, SeasonalTelemetryEvent } from "../lib/types.ts";

/** Deep pre-cutoff so 24h/7d age windows stay pre-cutoff. */
const PRE_CUTOFF = Date.parse("2026-01-15T00:00:00.000Z");
const POST_CUTOFF = Date.parse("2026-09-15T00:00:00.000Z") + 60_000;

type MemoryHarness = {
  client: ReturnType<typeof createClient>;
  store: SeasonalSnapshotStore;
  dbPath: string;
  dir: string;
  close: () => Promise<void>;
};

function createMemoryHarness(sharedDir?: string): MemoryHarness {
  // Bare `:memory:` breaks multi-connection isolation in @libsql/client sqlite3 mode.
  const dir = sharedDir ?? mkdtempSync(path.join(os.tmpdir(), "atb-seasonal-snap-"));
  const dbPath = path.join(dir, "db.sqlite");
  const url = pathToFileURL(dbPath).href;
  const client = createClient({ url });
  const store = createSeasonalSnapshotStore(client as unknown as SnapshotDbClient);
  return {
    client,
    store,
    dbPath,
    dir,
    close: async () => {
      try {
        client.close();
      } catch {
        // ignore
      }
      if (!sharedDir) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // Windows may briefly lock the file.
        }
      }
    }
  };
}

function makeAnime(id: string, source: "anilist" | "jikan" = "anilist"): AnimeItem {
  return {
    id,
    source,
    title: `作品${id}`,
    titles: { native: `作品${id}`, userPreferred: `Anime ${id}` },
    imageUrl: `https://example.com/${id}.jpg`,
    proxiedImageUrl: `/api/image-proxy?url=${encodeURIComponent(`https://example.com/${id}.jpg`)}`,
    siteUrl: `https://anilist.co/anime/${id}`,
    format: "TV",
    season: "FALL",
    seasonYear: 2026,
    episodes: 12,
    popularity: 1000,
    genres: ["Action"],
    studios: [{ name: "Studio" }]
  };
}

function snapshot(partial: {
  seasonalKey?: string;
  source?: "anilist" | "jikan";
  items?: AnimeItem[];
  fetchedAt?: string;
}): SeasonalSnapshotRecord {
  const seasonalKey = partial.seasonalKey ?? "2026:FALL";
  const parsed = parseSeasonalSnapshotKey(seasonalKey);
  assert.ok(parsed);
  return {
    seasonalKey,
    seasonYear: parsed.seasonYear,
    season: parsed.season,
    source: partial.source ?? "anilist",
    items: partial.items ?? [makeAnime("1")],
    fetchedAt: partial.fetchedAt ?? "2026-01-15T00:00:00.000Z"
  };
}

function makeMedia(id: number) {
  return {
    id,
    title: {
      native: `作品${id}`,
      userPreferred: `Anime ${id}`,
      romaji: `Anime ${id}`,
      english: `Anime ${id}`
    },
    coverImage: { large: `https://example.com/${id}.jpg` },
    siteUrl: `https://anilist.co/anime/${id}`,
    format: "TV",
    season: "FALL",
    seasonYear: 2026,
    episodes: 12,
    averageScore: 70,
    popularity: 1000 - id,
    favourites: 10,
    trending: 1,
    genres: ["Action"],
    studios: { nodes: [{ id: 1, name: "Studio", isAnimationStudio: true }] },
    characters: { edges: [] },
    isAdult: false,
    startDate: { year: 2026, month: 10, day: 1 },
    nextAiringEpisode: null,
    airingSchedule: { nodes: [] },
    streamingEpisodes: []
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function anilistOkFetch(): typeof fetch {
  return async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes("api.jikan.moe")) {
      throw new Error("Jikan should not be required in this test");
    }
    return jsonResponse({
      data: {
        Page: {
          pageInfo: { hasNextPage: false },
          media: [makeMedia(1)]
        }
      }
    });
  };
}

function anilistFailFetch(): typeof fetch {
  return async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes("api.jikan.moe")) {
      return new Response("err", { status: 500 });
    }
    return new Response("err", { status: 503 });
  };
}

// ---------------------------------------------------------------------------
// Repository unit tests (in-memory libSQL)
// ---------------------------------------------------------------------------

test("parseSeasonalSnapshotKey accepts only YYYY:SEASON|ALL", () => {
  assert.deepEqual(parseSeasonalSnapshotKey("2026:FALL"), {
    seasonYear: 2026,
    season: "FALL"
  });
  assert.deepEqual(parseSeasonalSnapshotKey("2026:ALL"), {
    seasonYear: 2026,
    season: "ALL"
  });
  assert.equal(parseSeasonalSnapshotKey("2026:fall"), null);
  assert.equal(parseSeasonalSnapshotKey("26:FALL"), null);
  assert.equal(parseSeasonalSnapshotKey("2026:WINTER:EXTRA"), null);
  assert.equal(parseSeasonalSnapshotKey(""), null);
});

test("shouldReplace: newer timestamp wins; same ts anilist over jikan", () => {
  assert.equal(
    shouldReplace(
      "2026-01-01T00:00:00.000Z",
      "anilist",
      "2026-01-02T00:00:00.000Z",
      "jikan"
    ),
    true
  );
  assert.equal(
    shouldReplace(
      "2026-01-02T00:00:00.000Z",
      "jikan",
      "2026-01-01T00:00:00.000Z",
      "anilist"
    ),
    false
  );
  assert.equal(
    shouldReplace(
      "2026-01-01T00:00:00.000Z",
      "jikan",
      "2026-01-01T00:00:00.000Z",
      "anilist"
    ),
    true
  );
  assert.equal(
    shouldReplace(
      "2026-01-01T00:00:00.000Z",
      "anilist",
      "2026-01-01T00:00:00.000Z",
      "jikan"
    ),
    false
  );
});

test("isCanonicalUtcTimestamp: strict grammar + calendar validity", () => {
  // Accepted: exact Date#toISOString form (preserved as-is by put/get).
  assert.equal(isCanonicalUtcTimestamp("2026-01-15T00:00:00.000Z"), true);
  assert.equal(isCanonicalUtcTimestamp("2026-02-28T23:59:59.999Z"), true);
  assert.equal(isCanonicalUtcTimestamp("2024-02-29T12:34:56.789Z"), true); // leap

  // Reject noncanonical / reduced precision / offsets / date-only.
  assert.equal(isCanonicalUtcTimestamp("2026-01-15"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-01-15T00:00:00Z"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-01-15T00:00:00.00Z"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-01-15T00:00:00.000"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-01-15T09:00:00.000+09:00"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-01-15T00:00:00.000+00:00"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-01-15 00:00:00.000Z"), false);
  assert.equal(isCanonicalUtcTimestamp("20260115T000000.000Z"), false);

  // Reject impossible calendar dates (Date.parse would coerce some of these).
  assert.equal(isCanonicalUtcTimestamp("2026-02-30T00:00:00.000Z"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-04-31T00:00:00.000Z"), false);
  assert.equal(isCanonicalUtcTimestamp("2025-02-29T00:00:00.000Z"), false); // non-leap
  assert.equal(isCanonicalUtcTimestamp("2026-13-01T00:00:00.000Z"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-00-10T00:00:00.000Z"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-01-15T24:00:00.000Z"), false);
  assert.equal(isCanonicalUtcTimestamp("2026-01-15T00:60:00.000Z"), false);
});

test("cross-instance roundtrip: put on A, get on B preserves source/fetchedAt/items", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "atb-seasonal-snap-x-"));
  const a = createMemoryHarness(dir);
  const b = createMemoryHarness(dir);
  try {
    const originalFetchedAt = "2026-01-10T12:34:56.000Z";
    const items = [makeAnime("42"), makeAnime("7")];
    await a.store.put(
      snapshot({
        seasonalKey: "2026:SPRING",
        source: "anilist",
        items,
        fetchedAt: originalFetchedAt
      })
    );

    const got = await b.store.get("2026:SPRING");
    assert.ok(got);
    assert.equal(got.seasonalKey, "2026:SPRING");
    assert.equal(got.seasonYear, 2026);
    assert.equal(got.season, "SPRING");
    assert.equal(got.source, "anilist");
    assert.equal(got.fetchedAt, originalFetchedAt);
    assert.equal(got.items.length, 2);
    assert.equal(got.items[0]?.id, "42");
    assert.equal(got.items[1]?.id, "7");
  } finally {
    await a.close();
    await b.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test("put precedence: older write does not overwrite newer; same-ts anilist wins", async () => {
  const h = createMemoryHarness();
  try {
    await h.store.put(
      snapshot({
        source: "jikan",
        items: [makeAnime("j1", "jikan")],
        fetchedAt: "2026-01-15T00:00:00.000Z"
      })
    );
    await h.store.put(
      snapshot({
        source: "anilist",
        items: [makeAnime("a1")],
        fetchedAt: "2026-01-15T00:00:00.000Z"
      })
    );
    let got = await h.store.get("2026:FALL");
    assert.equal(got?.source, "anilist");
    assert.equal(got?.items[0]?.id, "a1");

    await h.store.put(
      snapshot({
        source: "jikan",
        items: [makeAnime("j2", "jikan")],
        fetchedAt: "2026-01-15T00:00:00.000Z"
      })
    );
    got = await h.store.get("2026:FALL");
    assert.equal(got?.source, "anilist");
    assert.equal(got?.items[0]?.id, "a1");

    await h.store.put(
      snapshot({
        source: "jikan",
        items: [makeAnime("j3", "jikan")],
        fetchedAt: "2026-01-16T00:00:00.000Z"
      })
    );
    got = await h.store.get("2026:FALL");
    assert.equal(got?.source, "jikan");
    assert.equal(got?.items[0]?.id, "j3");
    assert.equal(got?.fetchedAt, "2026-01-16T00:00:00.000Z");
  } finally {
    await h.close();
  }
});

test("atomic concurrent writers: older jikan cannot overwrite newer anilist", async () => {
  const h = createMemoryHarness();
  try {
    const key = "2026:FALL";
    const newerAnilistAt = "2026-01-20T12:00:00.000Z";
    const olderJikanAt = "2026-01-10T12:00:00.000Z";

    // Seed the winning AniList snapshot first.
    await h.store.put(
      snapshot({
        seasonalKey: key,
        source: "anilist",
        items: [makeAnime("anilist-winner")],
        fetchedAt: newerAnilistAt
      })
    );

    // Deterministic interleaving: many concurrent older Jikan puts + one more AniList
    // refresh at the same newer timestamp. Conditional UPSERT must keep AniList.
    const writers: Promise<void>[] = [];
    for (let i = 0; i < 40; i++) {
      writers.push(
        h.store.put(
          snapshot({
            seasonalKey: key,
            source: "jikan",
            items: [makeAnime(`jikan-old-${i}`, "jikan")],
            fetchedAt: olderJikanAt
          })
        )
      );
      if (i % 5 === 0) {
        writers.push(
          h.store.put(
            snapshot({
              seasonalKey: key,
              source: "anilist",
              items: [makeAnime("anilist-winner")],
              fetchedAt: newerAnilistAt
            })
          )
        );
      }
    }
    await Promise.all(writers);

    const got = await h.store.get(key);
    assert.ok(got);
    assert.equal(got.source, "anilist");
    assert.equal(got.fetchedAt, newerAnilistAt);
    assert.equal(got.items[0]?.id, "anilist-winner");
    assert.notEqual(got.source, "jikan");
  } finally {
    await h.close();
  }
});

test("invalid/corrupt rows return null (cache miss, no repair)", async () => {
  const h = createMemoryHarness();
  try {
    await h.store.put(snapshot({ seasonalKey: "2026:WINTER" }));

    // Corrupt payload_json in place.
    await h.client.execute({
      sql: `UPDATE seasonal_anime_snapshots
            SET payload_json = ?
            WHERE seasonal_key = ?`,
      args: ["{not-json", "2026:WINTER"]
    });
    assert.equal(await h.store.get("2026:WINTER"), null);

    // Empty array is not a complete catalog snapshot.
    await h.client.execute({
      sql: `INSERT INTO seasonal_anime_snapshots
              (seasonal_key, season_year, season, source, payload_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "2026:SUMMER",
        2026,
        "SUMMER",
        "anilist",
        "[]",
        "2026-01-15T00:00:00.000Z"
      ]
    });
    assert.equal(await h.store.get("2026:SUMMER"), null);

    // Invalid source.
    await h.client.execute({
      sql: `INSERT INTO seasonal_anime_snapshots
              (seasonal_key, season_year, season, source, payload_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "2026:FALL",
        2026,
        "FALL",
        "mal",
        JSON.stringify([makeAnime("1")]),
        "2026-01-15T00:00:00.000Z"
      ]
    });
    assert.equal(await h.store.get("2026:FALL"), null);

    // Invalid key shape → miss without throw.
    assert.equal(await h.store.get("not-a-key"), null);

    // put rejects empty items.
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2025:FALL",
          items: []
        })
      )
    );
  } finally {
    await h.close();
  }
});

test("corrupt-read: partial/minimal AnimeItem payload is rejected on get", async () => {
  const h = createMemoryHarness();
  try {
    // Ensure schema exists (store creates lazily on first get/put).
    await h.store.put(snapshot({ seasonalKey: "2025:FALL" }));
    await h.client.execute({
      sql: `DELETE FROM seasonal_anime_snapshots WHERE seasonal_key = ?`,
      args: ["2025:FALL"]
    });

    // Minimal id+title+source (missing titles/imageUrl/proxiedImageUrl/siteUrl).
    await h.client.execute({
      sql: `INSERT INTO seasonal_anime_snapshots
              (seasonal_key, season_year, season, source, payload_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "2026:WINTER",
        2026,
        "WINTER",
        "anilist",
        JSON.stringify([
          { id: "min-1", source: "anilist", title: "だけの作品" }
        ]),
        "2026-01-15T00:00:00.000Z"
      ]
    });
    assert.equal(await h.store.get("2026:WINTER"), null);

    // Missing imageUrl only.
    const almost = makeAnime("almost");
    const { imageUrl: _drop, ...withoutImage } = almost;
    await h.client.execute({
      sql: `INSERT INTO seasonal_anime_snapshots
              (seasonal_key, season_year, season, source, payload_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "2026:SPRING",
        2026,
        "SPRING",
        "anilist",
        JSON.stringify([withoutImage]),
        "2026-01-15T00:00:00.000Z"
      ]
    });
    assert.equal(await h.store.get("2026:SPRING"), null);

    // titles present but wrong type.
    await h.client.execute({
      sql: `INSERT INTO seasonal_anime_snapshots
              (seasonal_key, season_year, season, source, payload_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "2026:SUMMER",
        2026,
        "SUMMER",
        "anilist",
        JSON.stringify([
          {
            ...makeAnime("bad-titles"),
            titles: "not-an-object"
          }
        ]),
        "2026-01-15T00:00:00.000Z"
      ]
    });
    assert.equal(await h.store.get("2026:SUMMER"), null);

    // Noncanonical / invalid fetched_at on stored row.
    await h.client.execute({
      sql: `INSERT INTO seasonal_anime_snapshots
              (seasonal_key, season_year, season, source, payload_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "2026:FALL",
        2026,
        "FALL",
        "anilist",
        JSON.stringify([makeAnime("ts")]),
        "2026-02-30T00:00:00.000Z"
      ]
    });
    assert.equal(await h.store.get("2026:FALL"), null);
  } finally {
    await h.close();
  }
});

test("invalid-write: partial items and noncanonical timestamps reject on put", async () => {
  const h = createMemoryHarness();
  try {
    // Minimal partial item must not write.
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:WINTER",
          items: [
            {
              id: "partial",
              source: "anilist",
              title: "不完全"
            } as AnimeItem
          ]
        })
      )
    );

    // Missing siteUrl.
    const noSite = makeAnime("no-site");
    const { siteUrl: _s, ...withoutSite } = noSite;
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:SPRING",
          items: [withoutSite as AnimeItem]
        })
      )
    );

    // Date-only fetchedAt.
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:SUMMER",
          fetchedAt: "2026-01-15"
        })
      )
    );

    // Offset form (non-UTC-Z canonical).
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:SUMMER",
          fetchedAt: "2026-01-15T00:00:00.000+00:00"
        })
      )
    );

    // Impossible calendar date.
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:SUMMER",
          fetchedAt: "2026-02-30T00:00:00.000Z"
        })
      )
    );

    // Successful put preserves the exact accepted timestamp string.
    const exact = "2026-03-01T08:09:10.123Z";
    await h.store.put(
      snapshot({
        seasonalKey: "2026:FALL",
        fetchedAt: exact
      })
    );
    const got = await h.store.get("2026:FALL");
    assert.equal(got?.fetchedAt, exact);
  } finally {
    await h.close();
  }
});

test("YYYY:ALL key roundtrip", async () => {
  const h = createMemoryHarness();
  try {
    await h.store.put(
      snapshot({
        seasonalKey: "2026:ALL",
        items: [makeAnime("all-1"), makeAnime("all-2")],
        fetchedAt: "2026-01-15T00:00:00.000Z"
      })
    );
    const got = await h.store.get("2026:ALL");
    assert.ok(got);
    assert.equal(got.season, "ALL");
    assert.equal(got.items.length, 2);
  } finally {
    await h.close();
  }
});

// ---------------------------------------------------------------------------
// Nested AnimeItem member validation (ATB-314-D1 FIX_SPEC)
// ---------------------------------------------------------------------------

async function insertPayload(
  h: MemoryHarness,
  seasonalKey: string,
  items: unknown[],
  fetchedAt = "2026-01-15T00:00:00.000Z"
): Promise<void> {
  const parsed = parseSeasonalSnapshotKey(seasonalKey);
  assert.ok(parsed);
  await h.client.execute({
    sql: `INSERT INTO seasonal_anime_snapshots
            (seasonal_key, season_year, season, source, payload_json, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      seasonalKey,
      parsed.seasonYear,
      parsed.season,
      "anilist",
      JSON.stringify(items),
      fetchedAt
    ]
  });
}

async function ensureSchema(h: MemoryHarness): Promise<void> {
  await h.store.put(snapshot({ seasonalKey: "2025:FALL" }));
  await h.client.execute({
    sql: `DELETE FROM seasonal_anime_snapshots WHERE seasonal_key = ?`,
    args: ["2025:FALL"]
  });
}

test("nested ok: valid optional nested members roundtrip on put/get", async () => {
  const h = createMemoryHarness();
  try {
    const full: AnimeItem = {
      ...makeAnime("nested-ok"),
      reputation: {
        score: 8.5,
        scoreMax: 10,
        scoredBy: 1000,
        popularity: 50,
        members: 9000,
        favourites: 100,
        trending: 3,
        rank: 12
      },
      airing: {
        startDate: "2026-10-01",
        broadcastDay: "Sunday",
        broadcastTime: "23:00",
        broadcastTimezone: "Asia/Tokyo",
        broadcastText: "毎週日曜 23:00",
        courEstimate: "1クール",
        nextEpisode: {
          episode: 2,
          airingAt: "2026-10-08T14:00:00.000Z",
          timeUntilAiringSeconds: 3600
        },
        recentEpisodes: [{ episode: 1, airingAt: "2026-10-01T14:00:00.000Z" }]
      },
      streamingEpisodes: [
        { title: "EP1", site: "Crunchyroll", url: "https://example.com/ep1" }
      ],
      streamingPlatforms: [
        {
          name: "Crunchyroll",
          url: "https://example.com/cr",
          source: "anilist",
          region: "JP"
        }
      ],
      streamingProvidersJp: {
        flatrate: [{ id: 8, name: "Netflix", logoUrl: "https://example.com/n.png" }],
        providerLink: "https://example.com/watch"
      },
      voiceActors: [
        {
          id: 1,
          name: "花澤香菜",
          nativeName: "花澤香菜",
          language: "Japanese",
          imageUrl: "https://example.com/va.jpg",
          siteUrl: "https://anilist.co/staff/1",
          characterName: "主人公",
          characterRole: "MAIN"
        }
      ]
    };

    await h.store.put(
      snapshot({
        seasonalKey: "2026:WINTER",
        items: [full]
      })
    );
    const got = await h.store.get("2026:WINTER");
    assert.ok(got);
    assert.equal(got.items[0]?.reputation?.score, 8.5);
    assert.equal(got.items[0]?.airing?.nextEpisode?.episode, 2);
    assert.equal(got.items[0]?.streamingEpisodes?.[0]?.url, "https://example.com/ep1");
    assert.equal(got.items[0]?.streamingPlatforms?.[0]?.name, "Crunchyroll");
    assert.equal(got.items[0]?.streamingProvidersJp?.flatrate[0]?.id, 8);
    assert.equal(got.items[0]?.voiceActors?.[0]?.name, "花澤香菜");
  } finally {
    await h.close();
  }
});

test("corrupt-read: nested reputation scalar type errors reject on get", async () => {
  const h = createMemoryHarness();
  try {
    await ensureSchema(h);
    await insertPayload(h, "2026:WINTER", [
      { ...makeAnime("rep-bad"), reputation: { score: "high" } }
    ]);
    assert.equal(await h.store.get("2026:WINTER"), null);

    await insertPayload(h, "2026:SPRING", [
      { ...makeAnime("rep-ok"), reputation: { score: 7.2, favourites: null } }
    ]);
    const ok = await h.store.get("2026:SPRING");
    assert.ok(ok);
    assert.equal(ok.items[0]?.reputation?.score, 7.2);
  } finally {
    await h.close();
  }
});

test("invalid-write: nested reputation scalar type errors reject on put", async () => {
  const h = createMemoryHarness();
  try {
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:WINTER",
          items: [
            {
              ...makeAnime("rep-write-bad"),
              reputation: { popularity: "many" as unknown as number }
            }
          ]
        })
      )
    );

    // Omitted reputation is still valid.
    await h.store.put(
      snapshot({
        seasonalKey: "2026:SPRING",
        items: [makeAnime("rep-omit")]
      })
    );
    assert.ok(await h.store.get("2026:SPRING"));
  } finally {
    await h.close();
  }
});

test("corrupt-read: nested airing scalar / nextEpisode errors reject on get", async () => {
  const h = createMemoryHarness();
  try {
    await ensureSchema(h);
    await insertPayload(h, "2026:WINTER", [
      {
        ...makeAnime("air-bad-scalar"),
        airing: { broadcastDay: 1 }
      }
    ]);
    assert.equal(await h.store.get("2026:WINTER"), null);

    await insertPayload(h, "2026:SPRING", [
      {
        ...makeAnime("air-bad-next"),
        airing: {
          nextEpisode: { episode: "2", airingAt: "2026-10-08T14:00:00.000Z" }
        }
      }
    ]);
    assert.equal(await h.store.get("2026:SPRING"), null);

    await insertPayload(h, "2026:SUMMER", [
      {
        ...makeAnime("air-ok"),
        airing: {
          startDate: "2026-10-01",
          nextEpisode: null,
          recentEpisodes: [{ episode: 1, airingAt: "2026-10-01T14:00:00.000Z" }]
        }
      }
    ]);
    assert.ok(await h.store.get("2026:SUMMER"));
  } finally {
    await h.close();
  }
});

test("invalid-write: nested airing type errors reject on put", async () => {
  const h = createMemoryHarness();
  try {
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:WINTER",
          items: [
            {
              ...makeAnime("air-write-bad"),
              airing: {
                recentEpisodes: [
                  { episode: 1, airingAt: 12345 as unknown as string }
                ]
              }
            }
          ]
        })
      )
    );
  } finally {
    await h.close();
  }
});

test("corrupt-read: streamingEpisodes object field errors reject on get", async () => {
  const h = createMemoryHarness();
  try {
    await ensureSchema(h);
    // url must be string, not number.
    await insertPayload(h, "2026:WINTER", [
      {
        ...makeAnime("ep-bad-url"),
        streamingEpisodes: [{ title: "EP1", url: 99 }]
      }
    ]);
    assert.equal(await h.store.get("2026:WINTER"), null);

    await insertPayload(h, "2026:SPRING", [
      {
        ...makeAnime("ep-ok"),
        streamingEpisodes: [{ url: "https://example.com/e1", title: null }]
      }
    ]);
    assert.ok(await h.store.get("2026:SPRING"));
  } finally {
    await h.close();
  }
});

test("invalid-write: streamingEpisodes url type errors reject on put", async () => {
  const h = createMemoryHarness();
  try {
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:WINTER",
          items: [
            {
              ...makeAnime("ep-write-bad"),
              streamingEpisodes: [
                { url: 123 as unknown as string, site: "CR" }
              ]
            }
          ]
        })
      )
    );
  } finally {
    await h.close();
  }
});

test("corrupt-read: streamingPlatforms object field errors reject on get", async () => {
  const h = createMemoryHarness();
  try {
    await ensureSchema(h);
    await insertPayload(h, "2026:WINTER", [
      {
        ...makeAnime("plat-bad"),
        streamingPlatforms: [{ name: "CR", url: 42 }]
      }
    ]);
    assert.equal(await h.store.get("2026:WINTER"), null);

    await insertPayload(h, "2026:SPRING", [
      {
        ...makeAnime("plat-ok"),
        streamingPlatforms: [{ name: "CR", url: "https://example.com/cr" }]
      }
    ]);
    assert.ok(await h.store.get("2026:SPRING"));
  } finally {
    await h.close();
  }
});

test("invalid-write: streamingPlatforms type errors reject on put", async () => {
  const h = createMemoryHarness();
  try {
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:WINTER",
          items: [
            {
              ...makeAnime("plat-write-bad"),
              streamingPlatforms: [
                {
                  name: "CR",
                  url: "https://example.com",
                  region: 81 as unknown as string
                }
              ]
            }
          ]
        })
      )
    );
  } finally {
    await h.close();
  }
});

test("corrupt-read: streamingProvidersJp arrays/item fields reject on get", async () => {
  const h = createMemoryHarness();
  try {
    await ensureSchema(h);
    // flatrate must be array, not string.
    await insertPayload(h, "2026:WINTER", [
      {
        ...makeAnime("jp-flatrate-str"),
        streamingProvidersJp: { flatrate: "netflix" }
      }
    ]);
    assert.equal(await h.store.get("2026:WINTER"), null);

    // provider item field type error.
    await insertPayload(h, "2026:SPRING", [
      {
        ...makeAnime("jp-item-bad"),
        streamingProvidersJp: {
          flatrate: [{ id: "8", name: "Netflix", logoUrl: null }]
        }
      }
    ]);
    assert.equal(await h.store.get("2026:SPRING"), null);

    await insertPayload(h, "2026:SUMMER", [
      {
        ...makeAnime("jp-ok"),
        streamingProvidersJp: {
          flatrate: [{ id: 8, name: "Netflix", logoUrl: null }],
          providerLink: null
        }
      }
    ]);
    assert.ok(await h.store.get("2026:SUMMER"));
  } finally {
    await h.close();
  }
});

test("invalid-write: streamingProvidersJp flatrate/item errors reject on put", async () => {
  const h = createMemoryHarness();
  try {
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:WINTER",
          items: [
            {
              ...makeAnime("jp-write-bad"),
              streamingProvidersJp: {
                flatrate: "not-array" as unknown as []
              }
            }
          ]
        })
      )
    );

    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:SPRING",
          items: [
            {
              ...makeAnime("jp-write-item-bad"),
              streamingProvidersJp: {
                flatrate: [
                  {
                    id: 8,
                    name: "Netflix",
                    logoUrl: 0 as unknown as string
                  }
                ]
              }
            }
          ]
        })
      )
    );
  } finally {
    await h.close();
  }
});

test("corrupt-read: partial wrong-typed voice actor data rejects on get", async () => {
  const h = createMemoryHarness();
  try {
    await ensureSchema(h);
    // Missing name is already invalid; also wrong-typed optional fields.
    await insertPayload(h, "2026:WINTER", [
      {
        ...makeAnime("va-bad-lang"),
        voiceActors: [{ name: "VA", language: 1 }]
      }
    ]);
    assert.equal(await h.store.get("2026:WINTER"), null);

    await insertPayload(h, "2026:SPRING", [
      {
        ...makeAnime("va-bad-id"),
        voiceActors: [{ name: "VA", id: { x: 1 } }]
      }
    ]);
    assert.equal(await h.store.get("2026:SPRING"), null);

    await insertPayload(h, "2026:SUMMER", [
      {
        ...makeAnime("va-ok"),
        voiceActors: [
          {
            name: "花澤香菜",
            characterName: "主人公",
            imageUrl: null
          }
        ]
      }
    ]);
    assert.ok(await h.store.get("2026:SUMMER"));
  } finally {
    await h.close();
  }
});

test("invalid-write: partial wrong-typed voice actor data rejects on put", async () => {
  const h = createMemoryHarness();
  try {
    await assert.rejects(() =>
      h.store.put(
        snapshot({
          seasonalKey: "2026:WINTER",
          items: [
            {
              ...makeAnime("va-write-bad"),
              voiceActors: [
                {
                  name: "VA",
                  siteUrl: false as unknown as string
                }
              ]
            }
          ]
        })
      )
    );

    // name-only (other fields omitted) remains valid.
    await h.store.put(
      snapshot({
        seasonalKey: "2026:SPRING",
        items: [
          {
            ...makeAnime("va-name-only"),
            voiceActors: [{ name: "のみ" }]
          }
        ]
      })
    );
    const got = await h.store.get("2026:SPRING");
    assert.equal(got?.items[0]?.voiceActors?.[0]?.name, "のみ");
  } finally {
    await h.close();
  }
});

// ---------------------------------------------------------------------------
// Policy integration with injected store
// ---------------------------------------------------------------------------

test("fresh_direct from durable ≤24h: no upstream, telemetry source=db_snapshot", async () => {
  const h = createMemoryHarness();
  try {
    const fetchedAt = new Date(PRE_CUTOFF).toISOString();
    await h.store.put(
      snapshot({
        seasonalKey: "2026:FALL",
        source: "anilist",
        items: [makeAnime("snap-1")],
        fetchedAt
      })
    );

    const urls: string[] = [];
    const telemetry: SeasonalTelemetryEvent[] = [];
    let nowMs = PRE_CUTOFF + 60_000; // age = 1 min
    const source = createSeasonalAnimeSource({
      now: () => nowMs,
      fetch: async (input) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        urls.push(url);
        throw new Error("upstream must not be called for durable fresh");
      },
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: h.store
    });

    const result = await source.fetchSeasonalAnime(2026, "FALL");
    assert.equal(result.freshness, "fresh");
    assert.equal(result.servePath, "fresh_direct");
    assert.equal(result.cached, true);
    assert.equal(result.source, "anilist");
    assert.equal(result.fetchedAt, fetchedAt);
    assert.equal(result.items[0]?.id, "snap-1");
    assert.equal(urls.length, 0);
    assert.equal(telemetry.length, 1);
    assert.equal(telemetry[0]?.source, "db_snapshot");
    assert.equal(telemetry[0]?.serve_path, "fresh_direct");
    assert.equal(telemetry[0]?.anilist_outcome, "skipped");
    assert.equal(telemetry[0]?.freshness, "fresh");
  } finally {
    await h.close();
  }
});

test("stale durable: live success updates store and returns fresh live", async () => {
  const h = createMemoryHarness();
  try {
    const originalFetchedAt = new Date(PRE_CUTOFF).toISOString();
    await h.store.put(
      snapshot({
        items: [makeAnime("old")],
        fetchedAt: originalFetchedAt
      })
    );

    const telemetry: SeasonalTelemetryEvent[] = [];
    const nowMs = PRE_CUTOFF + FRESH_MAX_AGE_MS + 1;
    const source = createSeasonalAnimeSource({
      now: () => nowMs,
      fetch: anilistOkFetch(),
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: h.store
    });

    const result = await source.fetchSeasonalAnime(2026, "FALL");
    assert.equal(result.freshness, "fresh");
    assert.equal(result.servePath, "live_anilist");
    assert.equal(result.cached, false);
    assert.equal(result.source, "anilist");
    assert.equal(result.fetchedAt, new Date(nowMs).toISOString());
    assert.ok(result.items.length >= 1);
    assert.equal(telemetry[0]?.source, "anilist");

    // Clear memory so the next read must hit durable.
    source.clearCache();
    const persisted = await h.store.get("2026:FALL");
    assert.ok(persisted);
    assert.equal(persisted.fetchedAt, new Date(nowMs).toISOString());
    assert.equal(persisted.source, "anilist");
    assert.notEqual(persisted.items[0]?.id, "old");
  } finally {
    await h.close();
  }
});

test("stale durable: live failure returns stale with original source/fetchedAt", async () => {
  const h = createMemoryHarness();
  try {
    const originalFetchedAt = new Date(PRE_CUTOFF).toISOString();
    await h.store.put(
      snapshot({
        source: "anilist",
        items: [makeAnime("stale-keep")],
        fetchedAt: originalFetchedAt
      })
    );

    const telemetry: SeasonalTelemetryEvent[] = [];
    const urls: string[] = [];
    const nowMs = PRE_CUTOFF + FRESH_MAX_AGE_MS + 5_000;
    const source = createSeasonalAnimeSource({
      now: () => nowMs,
      fetch: async (input) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        urls.push(url);
        if (url.includes("api.jikan.moe")) {
          return new Response("err", { status: 500 });
        }
        return new Response("err", { status: 503 });
      },
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: h.store
    });

    const result = await source.fetchSeasonalAnime(2026, "FALL");
    assert.equal(result.freshness, "stale");
    assert.equal(result.servePath, "stale_after_anilist_fail");
    assert.equal(result.cached, true);
    assert.equal(result.source, "anilist");
    assert.equal(result.fetchedAt, originalFetchedAt);
    assert.equal(result.items[0]?.id, "stale-keep");
    assert.ok(urls.some((u) => u.includes("graphql.anilist.co")));
    assert.equal(telemetry.length, 1);
    assert.equal(telemetry[0]?.source, "db_snapshot");
    assert.equal(telemetry[0]?.serve_path, "stale_after_anilist_fail");
    assert.equal(telemetry[0]?.freshness, "stale");
    assert.equal(telemetry[0]?.anilist_outcome, "http_5xx");
  } finally {
    await h.close();
  }
});

test("7-day bounds: age == 7d is stale candidate; age > 7d is not served", async () => {
  const h = createMemoryHarness();
  try {
    const fetchedAt = new Date(PRE_CUTOFF).toISOString();
    await h.store.put(
      snapshot({
        items: [makeAnime("edge")],
        fetchedAt
      })
    );

    // Exactly 7d: still stale, live runs, then stale on fail.
    {
      const telemetry: SeasonalTelemetryEvent[] = [];
      const nowMs = PRE_CUTOFF + STALE_MAX_AGE_MS;
      const source = createSeasonalAnimeSource({
        now: () => nowMs,
        fetch: anilistFailFetch(),
        onTelemetry: (e) => telemetry.push(e),
        jikanPageDelayMs: 0,
        snapshotStore: h.store
      });
      const result = await source.fetchSeasonalAnime(2026, "FALL");
      assert.equal(result.freshness, "stale");
      assert.equal(result.servePath, "stale_after_anilist_fail");
      assert.equal(result.fetchedAt, fetchedAt);
      assert.equal(telemetry[0]?.source, "db_snapshot");
    }

    // >7d: unusable — live fail → unavailable throw, no durable serve.
    {
      const telemetry: SeasonalTelemetryEvent[] = [];
      const nowMs = PRE_CUTOFF + STALE_MAX_AGE_MS + 1;
      const source = createSeasonalAnimeSource({
        now: () => nowMs,
        fetch: anilistFailFetch(),
        onTelemetry: (e) => telemetry.push(e),
        jikanPageDelayMs: 0,
        snapshotStore: h.store
      });
      await assert.rejects(() => source.fetchSeasonalAnime(2026, "FALL"));
      assert.equal(telemetry[0]?.freshness, "unavailable");
      assert.equal(telemetry[0]?.serve_path, "unavailable");
    }

    // Negative age (future fetched_at): not served as fresh/stale.
    {
      await h.store.put(
        snapshot({
          seasonalKey: "2026:SPRING",
          items: [makeAnime("future")],
          fetchedAt: new Date(PRE_CUTOFF + 10_000).toISOString()
        })
      );
      const urls: string[] = [];
      const nowMs = PRE_CUTOFF;
      const source = createSeasonalAnimeSource({
        now: () => nowMs,
        fetch: async (input) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          urls.push(url);
          return anilistOkFetch()(input, undefined);
        },
        onTelemetry: () => {},
        jikanPageDelayMs: 0,
        snapshotStore: h.store
      });
      const result = await source.fetchSeasonalAnime(2026, "SPRING");
      // Must go live, not serve future-dated snapshot as fresh_direct.
      assert.equal(result.servePath, "live_anilist");
      assert.ok(urls.some((u) => u.includes("graphql.anilist.co")));
    }
  } finally {
    await h.close();
  }
});

test("persistence after live: durable fresh_direct after clearCache", async () => {
  const h = createMemoryHarness();
  try {
    let nowMs = PRE_CUTOFF;
    const telemetry: SeasonalTelemetryEvent[] = [];
    const source = createSeasonalAnimeSource({
      now: () => nowMs,
      fetch: anilistOkFetch(),
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: h.store
    });

    const live = await source.fetchSeasonalAnime(2026, "FALL");
    assert.equal(live.servePath, "live_anilist");
    assert.equal(live.cached, false);

    source.clearCache();
    telemetry.length = 0;
    nowMs = PRE_CUTOFF + 1_000;

    const urls: string[] = [];
    const source2 = createSeasonalAnimeSource({
      now: () => nowMs,
      fetch: async (input) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        urls.push(url);
        throw new Error("must serve durable");
      },
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: h.store
    });

    const cached = await source2.fetchSeasonalAnime(2026, "FALL");
    assert.equal(cached.servePath, "fresh_direct");
    assert.equal(cached.cached, true);
    assert.equal(cached.fetchedAt, live.fetchedAt);
    assert.equal(urls.length, 0);
    assert.equal(telemetry[0]?.source, "db_snapshot");
  } finally {
    await h.close();
  }
});

test("repository failure isolation: get throw → live; put throw → live still valid", async () => {
  const failingGetStore: SeasonalSnapshotStore = {
    async get() {
      throw new Error("db read boom");
    },
    async put() {
      // ok
    }
  };

  {
    const telemetry: SeasonalTelemetryEvent[] = [];
    const source = createSeasonalAnimeSource({
      now: () => PRE_CUTOFF,
      fetch: anilistOkFetch(),
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: failingGetStore
    });
    const result = await source.fetchSeasonalAnime(2026, "FALL");
    assert.equal(result.servePath, "live_anilist");
    assert.equal(result.freshness, "fresh");
    assert.ok(result.items.length >= 1);
    assert.equal(telemetry[0]?.source, "anilist");
  }

  const failingPutStore: SeasonalSnapshotStore = {
    async get() {
      return null;
    },
    async put() {
      throw new Error("db write boom");
    }
  };

  {
    const telemetry: SeasonalTelemetryEvent[] = [];
    const source = createSeasonalAnimeSource({
      now: () => PRE_CUTOFF,
      fetch: anilistOkFetch(),
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: failingPutStore
    });
    const result = await source.fetchSeasonalAnime(2026, "FALL");
    assert.equal(result.servePath, "live_anilist");
    assert.equal(result.freshness, "fresh");
    assert.equal(result.cached, false);
    assert.ok(result.items.length >= 1);
    assert.equal(telemetry[0]?.source, "anilist");
  }
});

test("without snapshotStore, source stays DB-free (memory fresh_direct only)", async () => {
  let nowMs = PRE_CUTOFF;
  const telemetry: SeasonalTelemetryEvent[] = [];
  const source = createSeasonalAnimeSource({
    now: () => nowMs,
    fetch: anilistOkFetch(),
    onTelemetry: (e) => telemetry.push(e),
    jikanPageDelayMs: 0
    // no snapshotStore
  });

  await source.fetchSeasonalAnime(2026, "FALL");
  telemetry.length = 0;
  nowMs = PRE_CUTOFF + 1000;
  const second = await source.fetchSeasonalAnime(2026, "FALL");
  assert.equal(second.servePath, "fresh_direct");
  assert.equal(telemetry[0]?.source, "cache");
});

test("YYYY:ALL policy path uses durable store for year key", async () => {
  const h = createMemoryHarness();
  try {
    const fetchedAt = new Date(PRE_CUTOFF).toISOString();
    await h.store.put(
      snapshot({
        seasonalKey: "2026:ALL",
        items: [makeAnime("year-1"), makeAnime("year-2")],
        fetchedAt
      })
    );

    const urls: string[] = [];
    const telemetry: SeasonalTelemetryEvent[] = [];
    const source = createSeasonalAnimeSource({
      now: () => PRE_CUTOFF + 60_000,
      fetch: async (input) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        urls.push(url);
        throw new Error("year durable fresh must short-circuit");
      },
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: h.store
    });

    const result = await source.fetchYearlyAnime(2026);
    assert.equal(result.servePath, "fresh_direct");
    assert.equal(result.cached, true);
    assert.equal(result.items.length, 2);
    assert.equal(urls.length, 0);
    assert.equal(telemetry[0]?.seasonal_key, "2026:ALL");
    assert.equal(telemetry[0]?.source, "db_snapshot");
  } finally {
    await h.close();
  }
});

test("post-cutoff stale durable still zero Jikan (cutoff policy unchanged)", async () => {
  const h = createMemoryHarness();
  try {
    const fetchedAt = new Date(POST_CUTOFF).toISOString();
    await h.store.put(
      snapshot({
        items: [makeAnime("post-stale")],
        fetchedAt
      })
    );

    const urls: string[] = [];
    const telemetry: SeasonalTelemetryEvent[] = [];
    const nowMs = POST_CUTOFF + FRESH_MAX_AGE_MS + 1;
    const source = createSeasonalAnimeSource({
      now: () => nowMs,
      fetch: async (input) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        urls.push(url);
        if (url.includes("api.jikan.moe")) {
          throw new Error("Jikan must not be called post-cutoff");
        }
        return new Response("err", { status: 500 });
      },
      onTelemetry: (e) => telemetry.push(e),
      jikanPageDelayMs: 0,
      snapshotStore: h.store
    });

    const result = await source.fetchSeasonalAnime(2026, "FALL");
    assert.equal(result.freshness, "stale");
    assert.equal(result.servePath, "stale_after_anilist_fail");
    assert.equal(
      urls.filter((u) => u.includes("api.jikan.moe")).length,
      0
    );
    assert.equal(telemetry[0]?.jikan_outcome, "skipped_post_cutoff");
    assert.equal(telemetry[0]?.source, "db_snapshot");
    assert.equal(result.fetchedAt, fetchedAt);
  } finally {
    await h.close();
  }
});
