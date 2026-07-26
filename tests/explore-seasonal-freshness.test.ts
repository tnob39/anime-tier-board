/**
 * ATB-314-WEB-FRESHNESS-E1 — unit proof for the production seasonal freshness
 * resolver exported from app/explore/explore-client.tsx.
 *
 * Run with a TSX-capable runner (module has JSX + path aliases):
 *   npx --yes tsx --test tests/explore-seasonal-freshness.test.ts
 *
 * Primary proof is executable behavior of resolveSeasonalFreshnessView /
 * formatSeasonalFetchedAtJa. Source structural checks are supplemental only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatSeasonalFetchedAtJa,
  resolveSeasonalFreshnessView
} from "../app/explore/explore-client.tsx";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const exploreClientSource = readFileSync(
  path.join(projectRoot, "app/explore/explore-client.tsx"),
  "utf8"
);

const FETCHED_AT = "2026-01-15T03:00:00.000Z";
const FORMATTED_FETCHED_AT = "2026/1/15 12:00";

const UNAVAILABLE_TEXT =
  "季節データを取得できませんでした。時間をおいて「さがす」を押してください。";

function makeItem(id: string, title: string) {
  return {
    id,
    source: "anilist",
    title,
    titles: { native: title, romaji: title },
    imageUrl: "",
    proxiedImageUrl: "",
    siteUrl: `https://example.invalid/anime/${id}`,
    popularity: 1000,
    score: 80,
    genres: ["Action"]
  };
}

function baseOkPayload(overrides: Record<string, unknown> = {}) {
  return {
    year: 2025,
    season: "ALL",
    items: [makeItem("anilist-u-314-a", "Unit Freshness A")],
    source: "anilist",
    freshness: "fresh",
    fetchedAt: FETCHED_AT,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Primary: executable production resolver
// ---------------------------------------------------------------------------

test("formatSeasonalFetchedAtJa: ja-JP Asia/Tokyo for fixed ISO", () => {
  assert.equal(formatSeasonalFetchedAtJa(FETCHED_AT), FORMATTED_FETCHED_AT);
});

test("formatSeasonalFetchedAtJa: rejects empty / invalid / NaN dates", () => {
  assert.equal(formatSeasonalFetchedAtJa(""), null);
  assert.equal(formatSeasonalFetchedAtJa("not-a-date"), null);
  assert.equal(formatSeasonalFetchedAtJa("2026-99-99T00:00:00.000Z"), null);
});

test("resolve: fresh returns items + status notice with source/fetchedAt", () => {
  const item = makeItem("anilist-u-314-a", "Unit Freshness A");
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({ items: [item], source: "anilist", freshness: "fresh" })
  });

  assert.equal(result.notice.role, "status");
  assert.equal(
    result.notice.text,
    `最新の季節データです。データ元: anilist / 最終取得: ${FORMATTED_FETCHED_AT}`
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, item.id);
  assert.equal(result.items[0]?.title, item.title);
});

test("resolve: stale keeps items + status notice (cache copy)", () => {
  const items = [
    makeItem("anilist-u-314-a", "Unit Freshness A"),
    makeItem("anilist-u-314-b", "Unit Freshness B")
  ];
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({
      items,
      source: "jikan",
      freshness: "stale"
    })
  });

  assert.equal(result.notice.role, "status");
  assert.equal(
    result.notice.text,
    `データを更新できていません（キャッシュ表示・最大7日）。データ元: jikan / 最終取得: ${FORMATTED_FETCHED_AT}`
  );
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.title, "Unit Freshness A");
  assert.equal(result.items[1]?.title, "Unit Freshness B");
});

test("resolve: freshness unavailable clears items + alert", () => {
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({ freshness: "unavailable" })
  });

  assert.deepEqual(result.items, []);
  assert.equal(result.notice.role, "alert");
  assert.equal(result.notice.text, UNAVAILABLE_TEXT);
});

test("resolve: non-OK response normalizes to unavailable (ignores body items)", () => {
  const result = resolveSeasonalFreshnessView({
    ok: false,
    payload: baseOkPayload({
      items: [makeItem("x", "Should Not Appear")],
      freshness: "fresh"
    })
  });

  assert.deepEqual(result.items, []);
  assert.equal(result.notice.role, "alert");
  assert.equal(result.notice.text, UNAVAILABLE_TEXT);
});

test("resolve: null / non-object payload → unavailable", () => {
  for (const payload of [null, undefined, "string", 42, true] as unknown[]) {
    const result = resolveSeasonalFreshnessView({ ok: true, payload });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
    assert.equal(result.notice.text, UNAVAILABLE_TEXT);
  }
});

test("resolve: missing / unknown freshness → unavailable", () => {
  for (const freshness of [undefined, "weird", "", "FRESH"]) {
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ freshness })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: missing source / blank source → unavailable", () => {
  for (const source of [undefined, "", "   "]) {
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ source })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: missing / invalid fetchedAt → unavailable", () => {
  for (const fetchedAt of [undefined, "", "not-a-date"]) {
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ fetchedAt })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: non-array items → unavailable", () => {
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({ items: { not: "array" } })
  });
  assert.deepEqual(result.items, []);
  assert.equal(result.notice.role, "alert");
});

test("resolve: one null item clears entire list (no partial render)", () => {
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({
      items: [makeItem("ok", "Safe Title"), null]
    })
  });
  assert.deepEqual(result.items, []);
  assert.equal(result.notice.role, "alert");
  assert.equal(result.notice.text, UNAVAILABLE_TEXT);
});

test("resolve: one item missing required string field → unavailable", () => {
  const required = ["id", "title", "source", "imageUrl", "proxiedImageUrl", "siteUrl"] as const;
  for (const field of required) {
    const bad = makeItem("bad", "Bad Item") as Record<string, unknown>;
    bad[field] = 123; // non-string
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, [], `field ${field} must gate whole payload`);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: titles must be non-null non-array object", () => {
  for (const titles of [null, undefined, "x", ["a"], 1]) {
    const bad = makeItem("bad-titles", "T") as Record<string, unknown>;
    bad.titles = titles;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: malformed titles values → unavailable (whole payload)", () => {
  for (const titles of [
    { native: 123 },
    { romaji: true },
    { english: { x: 1 } },
    { userPreferred: ["a"] }
  ]) {
    const bad = makeItem("bad-title-vals", "T") as Record<string, unknown>;
    bad.titles = titles;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, [], `titles=${JSON.stringify(titles)}`);
    assert.equal(result.notice.role, "alert");
    assert.equal(result.notice.text, UNAVAILABLE_TEXT);
  }
});

test("resolve: malformed genres → unavailable (whole payload)", () => {
  for (const genres of ["Action", 1, { a: 1 }, [1], [null], ["Action", 2], null]) {
    const bad = makeItem("bad-genres", "T") as Record<string, unknown>;
    bad.genres = genres;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, [], `genres=${JSON.stringify(genres)}`);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: malformed format → unavailable", () => {
  for (const format of [1, true, { f: "TV" }, ["TV"]]) {
    const bad = makeItem("bad-format", "T") as Record<string, unknown>;
    bad.format = format;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: malformed studios → unavailable", () => {
  for (const studios of [
    "MAPPA",
    null,
    [null],
    [{ name: 1 }],
    [{ id: 1 }],
    [1]
  ]) {
    const bad = makeItem("bad-studios", "T") as Record<string, unknown>;
    bad.studios = studios;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: malformed voiceActors → unavailable", () => {
  for (const voiceActors of [
    "花澤",
    null,
    [null],
    [{ name: 1 }],
    [{ id: 1 }],
    ["花澤"]
  ]) {
    const bad = makeItem("bad-va", "T") as Record<string, unknown>;
    bad.voiceActors = voiceActors;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: malformed streamingPlatforms → unavailable", () => {
  for (const streamingPlatforms of [
    "cr",
    null,
    [{ name: "CR" }],
    [{ url: "https://example.invalid" }],
    [{ name: 1, url: "https://example.invalid" }],
    [{ name: "CR", url: 1 }]
  ]) {
    const bad = makeItem("bad-platforms", "T") as Record<string, unknown>;
    bad.streamingPlatforms = streamingPlatforms;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: malformed streamingProvidersJp flatrate/providerLink → unavailable", () => {
  const cases = [
    { flatrate: "netflix" },
    { flatrate: null },
    { flatrate: [{ id: "8", name: "Netflix", logoUrl: null }] },
    { flatrate: [{ id: 8, name: 1, logoUrl: null }] },
    { flatrate: [{ id: 8, name: "Netflix", logoUrl: 1 }] },
    {
      flatrate: [{ id: 8, name: "Netflix", logoUrl: null }],
      providerLink: 123
    },
    "not-object",
    null
  ];
  for (const streamingProvidersJp of cases) {
    const bad = makeItem("bad-providers-jp", "T") as Record<string, unknown>;
    bad.streamingProvidersJp = streamingProvidersJp;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: malformed streamingEpisodes url/site → unavailable", () => {
  for (const streamingEpisodes of [
    "ep",
    null,
    [{ site: "CR" }],
    [{ url: 1 }],
    [{ url: "https://example.invalid/ep", site: 1 }],
    [null]
  ]) {
    const bad = makeItem("bad-episodes", "T") as Record<string, unknown>;
    bad.streamingEpisodes = streamingEpisodes;
    const result = resolveSeasonalFreshnessView({
      ok: true,
      payload: baseOkPayload({ items: [bad] })
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.notice.role, "alert");
  }
});

test("resolve: one nested-malformed item among good items clears entire list", () => {
  const good = makeItem("ok", "Safe Title");
  const bad = makeItem("bad", "Bad Nested") as Record<string, unknown>;
  bad.genres = [1, "Action"];
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({ items: [good, bad] })
  });
  assert.deepEqual(result.items, []);
  assert.equal(result.notice.role, "alert");
  assert.equal(result.notice.text, UNAVAILABLE_TEXT);
});

test("resolve: well-formed optional nested fields still pass through", () => {
  const item = {
    ...makeItem("nested-ok", "Nested OK"),
    format: "TV",
    genres: ["Action", "Drama"],
    studios: [{ name: "MAPPA" }],
    voiceActors: [{ name: "花澤香菜" }],
    streamingPlatforms: [{ name: "Crunchyroll", url: "https://example.invalid/cr" }],
    streamingEpisodes: [{ url: "https://example.invalid/ep1", site: "Crunchyroll" }],
    streamingProvidersJp: {
      flatrate: [{ id: 8, name: "Netflix", logoUrl: null }],
      providerLink: "https://example.invalid/watch"
    },
    reputation: { score: 80, scoreMax: 100, popularity: 1000, members: 9000 },
    airing: { startDate: "2025-01-01" },
    seasonYear: 2025,
    isRebroadcast: false
  };
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({ items: [item], freshness: "fresh" })
  });
  assert.equal(result.notice.role, "status");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, "nested-ok");
  assert.deepEqual(result.items[0]?.genres, ["Action", "Drama"]);
});

test("resolve: source is trimmed in notice text", () => {
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({ source: "  anilist  ", freshness: "fresh" })
  });
  assert.equal(result.notice.role, "status");
  assert.match(result.notice.text, /データ元: anilist \/ 最終取得:/);
  assert.doesNotMatch(result.notice.text, /データ元:   anilist/);
});

test("resolve: does not invent freshness from age math (only payload fields)", () => {
  // Even if fetchedAt is ancient, freshness:"fresh" is trusted as given.
  const ancient = "2000-01-01T00:00:00.000Z";
  const formatted = formatSeasonalFetchedAtJa(ancient);
  assert.ok(formatted);
  const result = resolveSeasonalFreshnessView({
    ok: true,
    payload: baseOkPayload({ freshness: "fresh", fetchedAt: ancient })
  });
  assert.equal(result.notice.role, "status");
  assert.equal(
    result.notice.text,
    `最新の季節データです。データ元: anilist / 最終取得: ${formatted}`
  );
  assert.equal(result.items.length, 1);
});

// ---------------------------------------------------------------------------
// Supplemental: structural wiring (not primary behavioral proof)
// ---------------------------------------------------------------------------

test("source (supplemental): notice uses shared warning class + dynamic role", () => {
  assert.match(exploreClientSource, /className="notice warning"/);
  assert.match(exploreClientSource, /role=\{notice\.role\}/);
  assert.match(exploreClientSource, /setItems\(resolved\.items\)/);
  assert.match(exploreClientSource, /resolveSeasonalFreshnessView/);
});

test("source (supplemental): さがす remains seasonal retry; no alternate retry copy", () => {
  assert.match(exploreClientSource, /onClick=\{\(\) => void loadYear\(\)\}/);
  assert.match(exploreClientSource, /<span>さがす<\/span>/);
  assert.doesNotMatch(exploreClientSource, /再試行|リトライ|やり直す/);
});

test("source (supplemental): no display-mode branch for freshness notice", () => {
  assert.doesNotMatch(exploreClientSource, /useDisplayMode|displayMode|numanie-display-mode/);
  const noticeBlocks = exploreClientSource.match(/className="notice warning"/g) ?? [];
  assert.equal(noticeBlocks.length, 1);
});

test("source (supplemental): does not infer age with Date.now / max-age constants", () => {
  assert.doesNotMatch(
    exploreClientSource,
    /Date\.now\(\)\s*-\s*.*fetchedAt|fetchedAt.*Date\.now|FRESH_MAX_AGE|STALE_MAX_AGE|ageMs/
  );
});
