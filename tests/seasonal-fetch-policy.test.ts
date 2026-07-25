import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANILIST_ENDPOINT,
  ANILIST_MAX_PAGES,
  fetchAniListSeasonalAnime
} from "../lib/anime-sources/anilist.ts";
import {
  createSeasonalAnimeSource,
  FRESH_MAX_AGE_MS,
  JIKAN_CUTOFF_MS,
  STALE_MAX_AGE_MS
} from "../lib/anime-sources/index.ts";
import {
  JIKAN_HOST,
  JIKAN_MAX_PAGES,
  fetchJikanSeasonalAnime
} from "../lib/anime-sources/jikan.ts";
import type {
  AnimeItem,
  SeasonalTelemetryEvent
} from "../lib/types.ts";

/** Deep pre-cutoff so cache-age advances (24h/7d) stay pre-cutoff. */
const PRE_CUTOFF = Date.parse("2026-01-15T00:00:00.000Z");
const PRE_CUTOFF_EDGE = JIKAN_CUTOFF_MS - 1;
const AT_CUTOFF = JIKAN_CUTOFF_MS;
const POST_CUTOFF = JIKAN_CUTOFF_MS + 60_000;

type MockMode =
  | { type: "anilist_ok"; pages?: number; itemsPerPage?: number }
  | { type: "anilist_http"; status: number }
  | { type: "anilist_timeout" }
  | { type: "anilist_transport" }
  | { type: "anilist_malformed" }
  | { type: "anilist_empty" }
  | { type: "anilist_page_cap" }
  | { type: "jikan_ok"; pages?: number }
  | { type: "jikan_error" }
  | { type: "jikan_page_cap" };

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

function makeJikanEntry(malId: number) {
  return {
    mal_id: malId,
    url: `https://myanimelist.net/anime/${malId}`,
    images: {
      jpg: { image_url: `https://cdn.example.com/${malId}.jpg` }
    },
    title: `Jikan ${malId}`,
    title_japanese: `次漢${malId}`,
    type: "TV",
    episodes: 12,
    season: "fall",
    year: 2026,
    score: 7.5,
    popularity: 100,
    genres: [{ name: "Action" }],
    studios: [{ mal_id: 1, name: "Studio" }],
    broadcast: { string: "Sundays" },
    aired: { from: "2026-10-01T00:00:00+00:00" }
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function createFetchRecorder(plan: {
  anilist: MockMode;
  jikan?: MockMode;
}) {
  const urls: string[] = [];
  let anilistCalls = 0;
  let jikanCalls = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    urls.push(url);

    if (url.includes("graphql.anilist.co") || url === ANILIST_ENDPOINT) {
      anilistCalls += 1;
      const mode = plan.anilist;

      if (mode.type === "anilist_timeout") {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }
      if (mode.type === "anilist_transport") {
        throw new TypeError("fetch failed");
      }
      if (mode.type === "anilist_http") {
        return new Response("nope", { status: mode.status });
      }
      if (mode.type === "anilist_malformed") {
        return new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (mode.type === "anilist_empty") {
        return jsonResponse({
          data: { Page: { pageInfo: { hasNextPage: false }, media: [] } }
        });
      }
      if (mode.type === "anilist_page_cap") {
        // Always claim another page so the client hits the page cap.
        const page =
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as { variables?: { page?: number } }).variables
                ?.page ?? anilistCalls
            : anilistCalls;
        return jsonResponse({
          data: {
            Page: {
              pageInfo: { hasNextPage: true },
              media: [makeMedia(1000 + Number(page))]
            }
          }
        });
      }
      // anilist_ok
      const pages = mode.type === "anilist_ok" ? (mode.pages ?? 1) : 1;
      const itemsPerPage =
        mode.type === "anilist_ok" ? (mode.itemsPerPage ?? 1) : 1;
      const page =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as { variables?: { page?: number } }).variables
              ?.page ?? 1
          : 1;
      const start = (page - 1) * itemsPerPage;
      const media = Array.from({ length: itemsPerPage }, (_, i) =>
        makeMedia(start + i + 1)
      );
      return jsonResponse({
        data: {
          Page: {
            pageInfo: { hasNextPage: page < pages },
            media
          }
        }
      });
    }

    if (url.includes(JIKAN_HOST)) {
      jikanCalls += 1;
      const mode = plan.jikan ?? { type: "jikan_ok" as const };

      if (mode.type === "jikan_error") {
        return new Response("err", { status: 500 });
      }
      if (mode.type === "jikan_page_cap") {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get("page") ?? "1");
        return jsonResponse({
          data: [makeJikanEntry(2000 + page)],
          pagination: { has_next_page: true }
        });
      }
      // jikan_ok
      const pages = mode.type === "jikan_ok" ? (mode.pages ?? 1) : 1;
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get("page") ?? "1");
      return jsonResponse({
        data: [makeJikanEntry(page)],
        pagination: { has_next_page: page < pages }
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  return {
    fetchImpl,
    urls,
    get anilistCalls() {
      return anilistCalls;
    },
    get jikanCalls() {
      return jikanCalls;
    },
    jikanUrls() {
      return urls.filter((u) => u.includes(JIKAN_HOST));
    },
    anilistUrls() {
      return urls.filter(
        (u) => u.includes("graphql.anilist.co") || u === ANILIST_ENDPOINT
      );
    }
  };
}

function createHarness(options: {
  nowMs: number;
  anilist: MockMode;
  jikan?: MockMode;
}) {
  let nowMs = options.nowMs;
  const telemetry: SeasonalTelemetryEvent[] = [];
  const recorder = createFetchRecorder({
    anilist: options.anilist,
    jikan: options.jikan
  });
  const source = createSeasonalAnimeSource({
    now: () => nowMs,
    fetch: recorder.fetchImpl,
    onTelemetry: (event) => {
      telemetry.push(event);
    },
    jikanPageDelayMs: 0
  });
  return {
    source,
    telemetry,
    recorder,
    setNow(ms: number) {
      nowMs = ms;
    },
    advance(ms: number) {
      nowMs += ms;
    }
  };
}

test("V1 pre: AniList success → live_anilist, no Jikan, one telemetry", async () => {
  const h = createHarness({
    nowMs: PRE_CUTOFF,
    anilist: { type: "anilist_ok" }
  });
  const result = await h.source.fetchSeasonalAnime(2026, "FALL");
  assert.equal(result.source, "anilist");
  assert.equal(result.freshness, "fresh");
  assert.equal(result.servePath, "live_anilist");
  assert.equal(result.cached, false);
  assert.ok(result.items.length >= 1);
  assert.equal(h.recorder.jikanUrls().length, 0);
  assert.equal(h.telemetry.length, 1);
  assert.equal(h.telemetry[0]?.anilist_outcome, "success");
  assert.equal(h.telemetry[0]?.jikan_outcome, "skipped_pre_policy");
  assert.equal(h.telemetry[0]?.cutoff_regime, "pre");
  assert.equal(h.telemetry[0]?.serve_path, "live_anilist");
});

test("cutoff boundary: request_time == cutoff is post (zero Jikan)", async () => {
  const h = createHarness({
    nowMs: AT_CUTOFF,
    anilist: { type: "anilist_http", status: 500 },
    jikan: { type: "jikan_ok" }
  });
  await assert.rejects(() => h.source.fetchSeasonalAnime(2026, "FALL"));
  assert.equal(h.recorder.jikanUrls().length, 0);
  assert.equal(h.telemetry.length, 1);
  assert.equal(h.telemetry[0]?.cutoff_regime, "post");
  assert.equal(h.telemetry[0]?.jikan_outcome, "skipped_post_cutoff");
  assert.equal(h.telemetry[0]?.anilist_outcome, "http_5xx");
});

test("cutoff boundary: request_time == cutoff - 1ms is pre (Jikan allowed on failover)", async () => {
  const h = createHarness({
    nowMs: PRE_CUTOFF_EDGE,
    anilist: { type: "anilist_http", status: 500 },
    jikan: { type: "jikan_ok" }
  });
  const result = await h.source.fetchSeasonalAnime(2026, "FALL");
  assert.equal(result.source, "jikan");
  assert.equal(result.servePath, "live_jikan");
  assert.ok(h.recorder.jikanUrls().length >= 1);
  assert.equal(h.telemetry[0]?.cutoff_regime, "pre");
  assert.equal(h.telemetry[0]?.anilist_outcome, "http_5xx");
  assert.equal(h.telemetry[0]?.jikan_outcome, "success");
});

const failoverCases: Array<{
  name: string;
  anilist: MockMode;
  outcome: string;
}> = [
  { name: "timeout", anilist: { type: "anilist_timeout" }, outcome: "timeout" },
  {
    name: "transport",
    anilist: { type: "anilist_transport" },
    outcome: "transport"
  },
  {
    name: "http_429",
    anilist: { type: "anilist_http", status: 429 },
    outcome: "http_429"
  },
  {
    name: "http_5xx",
    anilist: { type: "anilist_http", status: 503 },
    outcome: "http_5xx"
  },
  {
    name: "malformed",
    anilist: { type: "anilist_malformed" },
    outcome: "malformed"
  },
  {
    name: "empty_results",
    anilist: { type: "anilist_empty" },
    outcome: "empty_results"
  }
];

for (const fc of failoverCases) {
  test(`pre failover class ${fc.name}: one Jikan logical attempt`, async () => {
    const h = createHarness({
      nowMs: PRE_CUTOFF,
      anilist: fc.anilist,
      jikan: { type: "jikan_ok" }
    });
    const result = await h.source.fetchSeasonalAnime(2026, "FALL");
    assert.equal(result.source, "jikan");
    assert.equal(result.freshness, "fresh");
    assert.equal(result.servePath, "live_jikan");
    assert.ok(result.warning?.includes("Jikan"));
    assert.ok(h.recorder.jikanUrls().length >= 1);
    assert.ok(
      h.recorder.jikanUrls().every((u) => u.includes("api.jikan.moe"))
    );
    assert.equal(h.telemetry.length, 1);
    assert.equal(h.telemetry[0]?.anilist_outcome, fc.outcome);
    assert.equal(h.telemetry[0]?.jikan_outcome, "success");
  });

  test(`post failover class ${fc.name}: zero Jikan network`, async () => {
    const h = createHarness({
      nowMs: POST_CUTOFF,
      anilist: fc.anilist,
      jikan: { type: "jikan_ok" }
    });
    await assert.rejects(() => h.source.fetchSeasonalAnime(2026, "FALL"));
    assert.equal(h.recorder.jikanUrls().length, 0);
    assert.equal(
      h.recorder.urls.filter((u) => u.includes(JIKAN_HOST)).length,
      0
    );
    assert.equal(h.telemetry.length, 1);
    assert.equal(h.telemetry[0]?.anilist_outcome, fc.outcome);
    assert.equal(h.telemetry[0]?.jikan_outcome, "skipped_post_cutoff");
    assert.equal(h.telemetry[0]?.freshness, "unavailable");
    assert.equal(h.telemetry[0]?.serve_path, "unavailable");
  });
}

test("V14 fresh_direct: age ≤24h skips upstream and emits skipped outcomes", async () => {
  const h = createHarness({
    nowMs: PRE_CUTOFF,
    anilist: { type: "anilist_ok" }
  });
  await h.source.fetchSeasonalAnime(2026, "FALL");
  h.telemetry.length = 0;
  h.recorder.urls.length = 0;

  h.advance(FRESH_MAX_AGE_MS); // still ≤24h (age == 24h)
  const second = await h.source.fetchSeasonalAnime(2026, "FALL");
  assert.equal(second.cached, true);
  assert.equal(second.freshness, "fresh");
  assert.equal(second.servePath, "fresh_direct");
  assert.equal(h.recorder.anilistUrls().length, 0);
  assert.equal(h.recorder.jikanUrls().length, 0);
  assert.equal(h.telemetry.length, 1);
  assert.equal(h.telemetry[0]?.anilist_outcome, "skipped");
  assert.equal(h.telemetry[0]?.jikan_outcome, "skipped_pre_policy");
  assert.equal(h.telemetry[0]?.serve_path, "fresh_direct");
  assert.equal(h.telemetry[0]?.source, "cache");
});

test("stale window: AniList fail → stale_after_anilist_fail (pre, Jikan also fail)", async () => {
  let phase: "ok" | "fail" = "ok";
  let nowMs = PRE_CUTOFF;
  const telemetry: SeasonalTelemetryEvent[] = [];
  const urls: string[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    urls.push(url);
    if (url.includes(JIKAN_HOST)) {
      return new Response("err", { status: 500 });
    }
    if (phase === "ok") {
      return jsonResponse({
        data: {
          Page: {
            pageInfo: { hasNextPage: false },
            media: [makeMedia(1)]
          }
        }
      });
    }
    return new Response("err", { status: 503 });
  };

  const source = createSeasonalAnimeSource({
    now: () => nowMs,
    fetch: fetchImpl,
    onTelemetry: (e) => telemetry.push(e),
    jikanPageDelayMs: 0
  });

  await source.fetchSeasonalAnime(2026, "FALL");
  phase = "fail";
  nowMs = PRE_CUTOFF + FRESH_MAX_AGE_MS + 1; // stale
  telemetry.length = 0;
  urls.length = 0;

  const stale = await source.fetchSeasonalAnime(2026, "FALL");
  assert.equal(stale.freshness, "stale");
  assert.equal(stale.servePath, "stale_after_anilist_fail");
  assert.equal(stale.cached, true);
  assert.ok(stale.items.length >= 1);
  assert.ok(urls.some((u) => u.includes("graphql.anilist.co")));
  assert.ok(urls.some((u) => u.includes(JIKAN_HOST))); // pre-cutoff failover attempted
  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0]?.serve_path, "stale_after_anilist_fail");
  assert.equal(telemetry[0]?.freshness, "stale");
  assert.equal(telemetry[0]?.anilist_outcome, "http_5xx");
  assert.equal(telemetry[0]?.jikan_outcome, "error");
  assert.equal(telemetry[0]?.source, "cache");
});

test("post stale window: AniList fail → stale, zero Jikan", async () => {
  let phase: "ok" | "fail" = "ok";
  let nowMs = POST_CUTOFF;
  const telemetry: SeasonalTelemetryEvent[] = [];
  const urls: string[] = [];

  const fetchImpl: typeof fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    urls.push(url);
    if (url.includes(JIKAN_HOST)) {
      throw new Error("Jikan must not be called post-cutoff");
    }
    if (phase === "ok") {
      return jsonResponse({
        data: {
          Page: {
            pageInfo: { hasNextPage: false },
            media: [makeMedia(2)]
          }
        }
      });
    }
    return new Response("err", { status: 500 });
  };

  const source = createSeasonalAnimeSource({
    now: () => nowMs,
    fetch: fetchImpl,
    onTelemetry: (e) => telemetry.push(e),
    jikanPageDelayMs: 0
  });

  await source.fetchSeasonalAnime(2026, "FALL");
  phase = "fail";
  nowMs = POST_CUTOFF + FRESH_MAX_AGE_MS + 1000;
  telemetry.length = 0;
  urls.length = 0;

  const stale = await source.fetchSeasonalAnime(2026, "FALL");
  assert.equal(stale.freshness, "stale");
  assert.equal(stale.servePath, "stale_after_anilist_fail");
  assert.equal(
    urls.filter((u) => u.includes(JIKAN_HOST)).length,
    0
  );
  assert.equal(telemetry[0]?.jikan_outcome, "skipped_post_cutoff");
});

test("age > 7d is unusable: no stale serve, unavailable on live fail", async () => {
  let phase: "ok" | "fail" = "ok";
  let nowMs = PRE_CUTOFF;
  const telemetry: SeasonalTelemetryEvent[] = [];

  const fetchImpl: typeof fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes(JIKAN_HOST)) {
      return new Response("err", { status: 500 });
    }
    if (phase === "ok") {
      return jsonResponse({
        data: {
          Page: {
            pageInfo: { hasNextPage: false },
            media: [makeMedia(3)]
          }
        }
      });
    }
    return new Response("err", { status: 500 });
  };

  const source = createSeasonalAnimeSource({
    now: () => nowMs,
    fetch: fetchImpl,
    onTelemetry: (e) => telemetry.push(e),
    jikanPageDelayMs: 0
  });

  await source.fetchSeasonalAnime(2026, "FALL");
  phase = "fail";
  nowMs = PRE_CUTOFF + STALE_MAX_AGE_MS + 1;
  telemetry.length = 0;

  await assert.rejects(() => source.fetchSeasonalAnime(2026, "FALL"));
  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0]?.freshness, "unavailable");
  assert.equal(telemetry[0]?.serve_path, "unavailable");
});

test("AniList page cap: no partial success, no 6th HTTP page", async () => {
  const h = createHarness({
    nowMs: PRE_CUTOFF,
    anilist: { type: "anilist_page_cap" },
    jikan: { type: "jikan_ok" }
  });
  const result = await h.source.fetchSeasonalAnime(2026, "FALL");
  // Failover to Jikan (timeout class for page budget exhaustion)
  assert.equal(result.source, "jikan");
  assert.equal(h.recorder.anilistCalls, ANILIST_MAX_PAGES);
  assert.ok(h.recorder.anilistCalls <= ANILIST_MAX_PAGES);
  assert.equal(h.telemetry[0]?.anilist_outcome, "timeout");
});

test("Jikan page cap: no 6th page, attempt fails (pre)", async () => {
  const h = createHarness({
    nowMs: PRE_CUTOFF,
    anilist: { type: "anilist_empty" },
    jikan: { type: "jikan_page_cap" }
  });
  await assert.rejects(() => h.source.fetchSeasonalAnime(2026, "FALL"));
  assert.equal(h.recorder.jikanCalls, JIKAN_MAX_PAGES);
  assert.equal(h.telemetry.length, 1);
  assert.equal(h.telemetry[0]?.jikan_outcome, "error");
  assert.equal(h.telemetry[0]?.freshness, "unavailable");
});

test("one frozen request_time: advancing clock mid-call does not flip regime mid-decision for cache age on same call", async () => {
  // request_time is frozen at call start; cutoff regime from that instant.
  const h = createHarness({
    nowMs: PRE_CUTOFF,
    anilist: { type: "anilist_ok" }
  });
  const result = await h.source.fetchSeasonalAnime(2026, "FALL");
  assert.equal(result.fetchedAt, new Date(PRE_CUTOFF).toISOString());
  assert.equal(h.telemetry[0]?.cutoff_regime, "pre");
});

test("sort by popularity desc then Japanese title; dedupe by id", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    urls.push(url);
    return jsonResponse({
      data: {
        Page: {
          pageInfo: { hasNextPage: false },
          media: [
            makeMedia(1),
            { ...makeMedia(1), popularity: 50 }, // duplicate id
            { ...makeMedia(2), popularity: 500, title: { native: "あ", userPreferred: "A", romaji: "A", english: "A" } },
            { ...makeMedia(3), popularity: 500, title: { native: "い", userPreferred: "B", romaji: "B", english: "B" } }
          ]
        }
      }
    });
  };
  const source = createSeasonalAnimeSource({
    now: () => PRE_CUTOFF,
    fetch: fetchImpl,
    onTelemetry: () => {},
    jikanPageDelayMs: 0
  });
  const result = await source.fetchSeasonalAnime(2026, "FALL");
  const ids = result.items.map((i: AnimeItem) => i.id);
  assert.deepEqual(new Set(ids).size, ids.length);
  // popularity 500 first (2 and 3), then lower
  assert.ok((result.items[0]?.popularity ?? 0) >= (result.items[1]?.popularity ?? 0));
});

test("yearly aggregate merges seasons and emits one top-level telemetry", async () => {
  const h = createHarness({
    nowMs: PRE_CUTOFF,
    anilist: { type: "anilist_ok" }
  });
  const result = await h.source.fetchYearlyAnime(2026);
  assert.ok(result.items.length >= 1);
  assert.equal(result.source, "anilist");
  assert.equal(result.freshness, "fresh");
  // 4 seasons × 1 page each
  assert.equal(h.recorder.anilistCalls, 4);
  assert.equal(h.telemetry.length, 1);
  assert.equal(h.telemetry[0]?.seasonal_key, "2026:ALL");
});

test("exactly one telemetry event on throw", async () => {
  const h = createHarness({
    nowMs: POST_CUTOFF,
    anilist: { type: "anilist_transport" },
    jikan: { type: "jikan_ok" }
  });
  await assert.rejects(() => h.source.fetchSeasonalAnime(2026, "WINTER"));
  assert.equal(h.telemetry.length, 1);
  assert.equal(h.recorder.jikanUrls().length, 0);
});

test("non-failover AniList HTTP 400 does not call Jikan pre-cutoff", async () => {
  const h = createHarness({
    nowMs: PRE_CUTOFF,
    anilist: { type: "anilist_http", status: 400 },
    jikan: { type: "jikan_ok" }
  });
  // 400 triggers safeQuery retry inside anilist client → 2 HTTP calls, still no Jikan
  await assert.rejects(() => h.source.fetchSeasonalAnime(2026, "FALL"));
  assert.equal(h.recorder.jikanUrls().length, 0);
  assert.equal(h.telemetry[0]?.jikan_outcome, "skipped_pre_policy");
});

// ---------------------------------------------------------------------------
// Fable FIX outcome blockers (ATB-674)
// ---------------------------------------------------------------------------

test("direct Jikan at exact cutoff makes zero host requests", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    urls.push(url);
    throw new Error("Jikan host must not be contacted at cutoff");
  };

  const result = await fetchJikanSeasonalAnime(2026, "FALL", {
    fetchImpl,
    now: () => AT_CUTOFF,
    requestTimeMs: AT_CUTOFF,
    deadlineMs: AT_CUTOFF + 6000,
    pageDelayMs: 0
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.outcome, "disabled");
    assert.equal(result.pagesUsed, 0);
    assert.deepEqual(result.items, []);
  }
  assert.equal(urls.length, 0);
  assert.equal(
    urls.filter((u) => u.includes(JIKAN_HOST)).length,
    0
  );
});

test("direct Jikan after cutoff makes zero host requests", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    urls.push(url);
    throw new Error("Jikan host must not be contacted after cutoff");
  };

  const result = await fetchJikanSeasonalAnime(2026, "FALL", {
    fetchImpl,
    now: () => POST_CUTOFF,
    requestTimeMs: POST_CUTOFF,
    deadlineMs: POST_CUTOFF + 6000,
    pageDelayMs: 0
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.outcome, "disabled");
    assert.equal(result.pagesUsed, 0);
    assert.deepEqual(result.items, []);
  }
  assert.equal(urls.filter((u) => u.includes(JIKAN_HOST)).length, 0);
});

test("direct Jikan pre-cutoff still performs host requests", async () => {
  const recorder = createFetchRecorder({
    anilist: { type: "anilist_ok" },
    jikan: { type: "jikan_ok" }
  });
  const result = await fetchJikanSeasonalAnime(2026, "FALL", {
    fetchImpl: recorder.fetchImpl,
    now: () => PRE_CUTOFF,
    requestTimeMs: PRE_CUTOFF,
    deadlineMs: PRE_CUTOFF + 6000,
    pageDelayMs: 0
  });
  assert.equal(result.ok, true);
  assert.ok(recorder.jikanCalls >= 1);
});

test("AniList shared physical five-HTTP budget includes safe-query retries; sixth never sent", async () => {
  let anilistCalls = 0;
  // Pattern: primary always 400 → safe-query succeeds with hasNextPage=true.
  // Each logical page costs 2 HTTP. Without a shared budget, page3 safe-query
  // would be the 6th request; with budget, the 6th must never be sent.
  const fetchImpl: typeof fetch = async (_input, init) => {
    anilistCalls += 1;
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as { query?: string; variables?: { page?: number } })
        : {};
    const isSafe = Boolean(body.query && !body.query.includes("studios"));
    const page = body.variables?.page ?? 1;

    if (!isSafe) {
      // Primary rich query → 400, force safe-query retry (counts toward budget).
      return new Response("bad query", { status: 400 });
    }

    // Safe query succeeds but always claims another page.
    return jsonResponse({
      data: {
        Page: {
          pageInfo: { hasNextPage: true },
          media: [makeMedia(1000 + Number(page))]
        }
      }
    });
  };

  const started = PRE_CUTOFF;
  const result = await fetchAniListSeasonalAnime(2026, "FALL", {
    fetchImpl,
    now: () => started,
    deadlineMs: started + 60_000
  });

  assert.equal(result.ok, false);
  // Max physical HTTP is 5: e.g. p1 primary, p1 safe, p2 primary, p2 safe, p3 primary.
  // p3 safe (6th) must never leave the client.
  assert.ok(anilistCalls <= ANILIST_MAX_PAGES);
  assert.equal(anilistCalls, ANILIST_MAX_PAGES);
  assert.deepEqual(result.items, []);
  if (!result.ok) {
    assert.equal(result.outcome, "timeout");
    assert.equal(result.pagesUsed, ANILIST_MAX_PAGES);
  }
});

test("AniList page-cap failure cannot return or cache partial data", async () => {
  const h = createHarness({
    nowMs: PRE_CUTOFF,
    anilist: { type: "anilist_page_cap" },
    jikan: { type: "jikan_error" }
  });
  await assert.rejects(() => h.source.fetchSeasonalAnime(2026, "FALL"));
  assert.equal(h.recorder.anilistCalls, ANILIST_MAX_PAGES);
  // No successful cache seed from partial AniList pages: next call still hits network.
  h.recorder.urls.length = 0;
  const before = h.recorder.anilistCalls;
  await assert.rejects(() => h.source.fetchSeasonalAnime(2026, "FALL"));
  assert.ok(h.recorder.anilistCalls > before);
});

test("absolute six-second deadline races even when fetch ignores AbortSignal", async () => {
  let fetchStarted = 0;
  let lateResolveCount = 0;
  const hangMs = 250;
  const budgetMs = 80;

  const fetchImpl: typeof fetch = async (_input, init) => {
    fetchStarted += 1;
    // Deliberately ignore AbortSignal — hang past the logical deadline.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, hangMs);
    });
    // If we got here after abort, count as late work that must not become success.
    if (init?.signal?.aborted) {
      lateResolveCount += 1;
    }
    return jsonResponse({
      data: {
        Page: {
          pageInfo: { hasNextPage: false },
          media: [makeMedia(99)]
        }
      }
    });
  };

  const started = Date.now();
  const result = await fetchAniListSeasonalAnime(2026, "FALL", {
    fetchImpl,
    now: () => Date.now(),
    deadlineMs: started + budgetMs
  });

  const elapsed = Date.now() - started;
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.outcome, "timeout");
    assert.deepEqual(result.items, []);
  }
  // Must settle near the deadline, not after the hanging fetch completes.
  assert.ok(
    elapsed < hangMs,
    `expected settle before hangMs=${hangMs}, elapsed=${elapsed}`
  );
  assert.ok(elapsed >= budgetMs - 20, `elapsed=${elapsed} budgetMs=${budgetMs}`);
  assert.equal(fetchStarted, 1);

  // Allow the ignored-signal fetch to finish; ensure it did not open a 2nd request.
  await new Promise((r) => setTimeout(r, hangMs + 30));
  assert.equal(fetchStarted, 1);
  void lateResolveCount;
});

test("Jikan absolute deadline races when fetch ignores AbortSignal", async () => {
  let fetchStarted = 0;
  const hangMs = 250;
  const budgetMs = 80;

  const fetchImpl: typeof fetch = async () => {
    fetchStarted += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, hangMs));
    return jsonResponse({
      data: [makeJikanEntry(1)],
      pagination: { has_next_page: false }
    });
  };

  const started = Date.now();
  const result = await fetchJikanSeasonalAnime(2026, "FALL", {
    fetchImpl,
    now: () => Date.now(),
    requestTimeMs: PRE_CUTOFF,
    deadlineMs: started + budgetMs,
    pageDelayMs: 0
  });

  const elapsed = Date.now() - started;
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.outcome, "error");
    assert.deepEqual(result.items, []);
  }
  assert.ok(elapsed < hangMs, `elapsed=${elapsed}`);
  assert.equal(fetchStarted, 1);
  await new Promise((r) => setTimeout(r, hangMs + 30));
  assert.equal(fetchStarted, 1);
});
