import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMergedStreamingPlatforms,
  getStreamingPlatformOverflowCount,
  normalizeStreamingDisplayName,
  STREAMING_PLATFORM_VISIBLE_LIMIT
} from "../lib/streaming-services.ts";
import type { AnimeItem } from "../lib/types.ts";

function makeAnime(overrides: Partial<AnimeItem> = {}): AnimeItem {
  return {
    id: "1",
    source: "anilist",
    title: "Test Anime",
    titles: { userPreferred: "Test Anime" },
    imageUrl: "https://example.com/a.jpg",
    proxiedImageUrl: "/api/image-proxy?url=a",
    siteUrl: "https://anilist.co/anime/1",
    ...overrides
  };
}

test("merges AniList platforms with TMDb JP flatrate instead of early-returning", () => {
  const item = makeAnime({
    streamingPlatforms: [
      { name: "Netflix", url: "https://www.netflix.com/title/anilist-only" }
    ],
    streamingProvidersJp: {
      flatrate: [
        { id: 8, name: "Netflix", logoUrl: null },
        { id: 9, name: "Amazon Prime Video", logoUrl: null },
        { id: 84, name: "U-NEXT", logoUrl: null }
      ],
      providerLink: "https://www.themoviedb.org/tv/1/watch?locale=JP"
    }
  });

  const platforms = getMergedStreamingPlatforms(item);
  assert.deepEqual(
    platforms.map((p) => p.name),
    ["Netflix", "Prime Video", "U-NEXT"]
  );
  assert.equal(platforms[0]?.url, "https://www.netflix.com/title/anilist-only");
  assert.equal(platforms[1]?.url, "https://www.themoviedb.org/tv/1/watch?locale=JP");
  assert.equal(platforms[2]?.url, "https://www.themoviedb.org/tv/1/watch?locale=JP");
});

test("normalizes Prime Video aliases and dedupes Netflix / U-NEXT variants", () => {
  assert.equal(normalizeStreamingDisplayName("Amazon Prime Video"), "Prime Video");
  assert.equal(normalizeStreamingDisplayName("Prime Video"), "Prime Video");
  assert.equal(normalizeStreamingDisplayName("amazon prime video with Ads"), "Prime Video");
  assert.equal(normalizeStreamingDisplayName("U-Next"), "U-NEXT");
  assert.equal(normalizeStreamingDisplayName("UNEXT"), "U-NEXT");
  assert.equal(normalizeStreamingDisplayName("Netflix Standard with Ads"), "Netflix");

  const item = makeAnime({
    streamingPlatforms: [
      { name: "Prime Video", url: "https://www.amazon.co.jp/primevideo/anilist" },
      { name: "Netflix", url: "https://www.netflix.com/title/1" }
    ],
    streamingProvidersJp: {
      flatrate: [
        { id: 9, name: "Amazon Prime Video", logoUrl: null },
        { id: 2100, name: "Amazon Prime Video with Ads", logoUrl: null },
        { id: 8, name: "Netflix", logoUrl: null },
        { id: 1796, name: "Netflix Standard with Ads", logoUrl: null },
        { id: 84, name: "U-NEXT", logoUrl: null }
      ],
      providerLink: "https://www.themoviedb.org/tv/2/watch?locale=JP"
    }
  });

  const platforms = getMergedStreamingPlatforms(item);
  assert.deepEqual(
    platforms.map((p) => p.name),
    ["Prime Video", "Netflix", "U-NEXT"]
  );
});

test("keeps AniList episode fallback when platforms and flatrate are empty", () => {
  const item = makeAnime({
    streamingPlatforms: [],
    streamingProvidersJp: { flatrate: [] },
    streamingEpisodes: [
      {
        title: "Episode 1",
        site: "Crunchyroll",
        url: "https://www.crunchyroll.com/watch/1"
      },
      {
        title: "Episode 2",
        site: "Crunchyroll",
        url: "https://www.crunchyroll.com/watch/2"
      },
      {
        title: "Episode 3",
        site: null,
        url: "https://www.bilibili.com/bangumi/1"
      }
    ]
  });

  const platforms = getMergedStreamingPlatforms(item);
  assert.deepEqual(
    platforms.map((p) => p.name),
    ["Crunchyroll", "Bilibili"]
  );
  assert.equal(platforms[0]?.url, "https://www.crunchyroll.com/watch/1");
});

test("does not silently drop platforms beyond 5; overflow helper reports +N", () => {
  const flatrate = [
    { id: 8, name: "Netflix", logoUrl: null },
    { id: 9, name: "Amazon Prime Video", logoUrl: null },
    { id: 84, name: "U-NEXT", logoUrl: null },
    { id: 391, name: "dアニメストア", logoUrl: null },
    { id: 223, name: "ABEMA", logoUrl: null },
    { id: 15, name: "Hulu", logoUrl: null },
    { id: 350, name: "Apple TV", logoUrl: null }
  ];

  const item = makeAnime({
    streamingProvidersJp: {
      flatrate,
      providerLink: "https://www.themoviedb.org/tv/3/watch?locale=JP"
    }
  });

  const platforms = getMergedStreamingPlatforms(item);
  assert.equal(platforms.length, 7);
  assert.equal(STREAMING_PLATFORM_VISIBLE_LIMIT, 5);
  assert.equal(getStreamingPlatformOverflowCount(platforms.length), 2);
  assert.equal(getStreamingPlatformOverflowCount(5), 0);
  assert.equal(getStreamingPlatformOverflowCount(0), 0);
});

test("defends malformed runtime shapes without throwing", () => {
  const malformed = {
    streamingPlatforms: "bad",
    streamingProvidersJp: { flatrate: "bad", providerLink: 123 },
    streamingEpisodes: [{ url: null }, null, "x"]
  } as unknown as AnimeItem;

  assert.deepEqual(getMergedStreamingPlatforms(malformed), []);
  assert.deepEqual(getMergedStreamingPlatforms(undefined), []);
  assert.deepEqual(getMergedStreamingPlatforms(null), []);

  const partial = makeAnime({
    streamingPlatforms: [
      { name: "", url: "https://example.com" } as never,
      { name: "Netflix", url: "" } as never,
      { name: "Netflix", url: "https://www.netflix.com/title/ok" }
    ],
    streamingProvidersJp: {
      flatrate: [
        { id: 8, name: "", logoUrl: null } as never,
        { id: 9, name: "Prime Video", logoUrl: null }
      ],
      providerLink: null
    }
  });

  const platforms = getMergedStreamingPlatforms(partial);
  assert.deepEqual(
    platforms.map((p) => p.name),
    ["Netflix", "Prime Video"]
  );
  assert.equal(platforms[0]?.url, "https://www.netflix.com/title/ok");
  // Missing TMDb link → known STREAMING_SERVICES landing URL (never "#").
  assert.equal(platforms[1]?.url, "https://www.amazon.co.jp/primevideo");
});

test("TMDb-only works when AniList platforms are absent", () => {
  const item = makeAnime({
    streamingProvidersJp: {
      flatrate: [{ id: 84, name: "U-NEXT", logoUrl: null }],
      providerLink: "https://www.themoviedb.org/tv/4/watch?locale=JP"
    }
  });

  assert.deepEqual(getMergedStreamingPlatforms(item), [
    {
      name: "U-NEXT",
      url: "https://www.themoviedb.org/tv/4/watch?locale=JP"
    }
  ]);
});

test("missing TMDb providerLink uses STREAMING_SERVICES landing URL or null, never #", () => {
  const known = makeAnime({
    streamingProvidersJp: {
      flatrate: [
        { id: 8, name: "Netflix", logoUrl: null },
        { id: 84, name: "U-NEXT", logoUrl: null }
      ],
      providerLink: null
    }
  });

  const knownPlatforms = getMergedStreamingPlatforms(known);
  assert.deepEqual(
    knownPlatforms.map((p) => ({ name: p.name, url: p.url })),
    [
      { name: "Netflix", url: "https://www.netflix.com/jp/" },
      { name: "U-NEXT", url: "https://video.unext.jp/" }
    ]
  );
  assert.ok(knownPlatforms.every((p) => p.url !== "#"));

  const unknown = makeAnime({
    streamingProvidersJp: {
      flatrate: [{ id: 350, name: "Apple TV", logoUrl: null }],
      providerLink: undefined
    }
  });

  const unknownPlatforms = getMergedStreamingPlatforms(unknown);
  assert.deepEqual(unknownPlatforms, [{ name: "Apple TV", url: null }]);
  assert.ok(!unknownPlatforms.some((p) => p.url === "#"));
});

test("rejects javascript/data/relative/malformed URLs; accepts absolute http/https", () => {
  const item = makeAnime({
    streamingPlatforms: [
      { name: "Evil JS", url: "javascript:alert(1)" },
      { name: "Evil Data", url: "data:text/html,hi" },
      { name: "Relative", url: "/watch/relative" },
      { name: "Hash only", url: "#" },
      { name: "Protocol relative", url: "//evil.example/path" },
      { name: "Malformed", url: "http://[::bad" },
      { name: "Empty host", url: "https://" },
      { name: "Good HTTPS", url: "https://www.netflix.com/title/safe" },
      { name: "Good HTTP", url: "http://example.com/anime" }
    ],
    streamingProvidersJp: {
      flatrate: [{ id: 9, name: "Amazon Prime Video", logoUrl: null }],
      providerLink: "javascript:void(0)"
    }
  });

  const platforms = getMergedStreamingPlatforms(item);
  const byName = Object.fromEntries(platforms.map((p) => [p.name, p.url]));

  assert.equal(byName["Evil JS"], null);
  assert.equal(byName["Evil Data"], null);
  assert.equal(byName["Relative"], null);
  assert.equal(byName["Hash only"], null);
  assert.equal(byName["Protocol relative"], null);
  assert.equal(byName["Malformed"], null);
  assert.equal(byName["Empty host"], null);
  assert.equal(byName["Good HTTPS"], "https://www.netflix.com/title/safe");
  assert.equal(byName["Good HTTP"], "http://example.com/anime");
  // Invalid TMDb providerLink falls back to known service landing URL.
  assert.equal(byName["Prime Video"], "https://www.amazon.co.jp/primevideo");
  assert.ok(platforms.every((p) => p.url !== "#"));
});
