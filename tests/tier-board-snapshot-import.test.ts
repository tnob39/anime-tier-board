import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  BOARD_IMPORT_VERSION,
  BOARD_UNRANKED_TIER_ID,
  IMPORT_SHARE_INTENT_MARKER_VERSION,
  MAX_EXTERNAL_ENTITY_ID,
  MAX_IMPORT_SHARE_INTENT_MARKER_CHARS,
  MAX_SHARE_PAYLOAD_BYTES,
  MAX_TIME_UNTIL_AIRING_SECONDS,
  UNCERTAIN_TITLE_PLACEHOLDER,
  collectShareItems,
  createImportShareIntentMarker,
  filterCatalogForImportTarget,
  importShareIntentStorageKey,
  isCatalogItemForImportSeason,
  mergeBoardItems,
  parseBoardDefinitionImport,
  parseImportShareIntentMarker,
  reconcileBoardWithCatalog,
  serializeImportShareIntentMarker,
  shouldEnableRemoteBoardAutosave,
  utf8ByteLength,
  validateSharePayload,
  type BoardWithSnapshots
} from "../lib/board-snapshot.ts";
import type { AnimeItem } from "../lib/types.ts";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const thirtyOneSlotFixtureRaw = readFileSync(
  join(fixtureDir, "fixtures", "atb-706-31-slot-seven-row.json"),
  "utf8"
);

function makeAnime(id: string, title: string, overrides: Partial<AnimeItem> = {}): AnimeItem {
  const imageUrl = `https://example.com/${id}.jpg`;
  return {
    id,
    source: "anilist",
    title,
    titles: { userPreferred: title, native: title },
    imageUrl,
    proxiedImageUrl: `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`,
    siteUrl: `https://anilist.co/anime/${id}`,
    ...overrides
  };
}

function realisticNestedAnime(id: string, title: string): AnimeItem {
  return makeAnime(id, title, {
    format: "TV",
    season: "SUMMER",
    seasonYear: 2026,
    episodes: 12,
    score: 78,
    popularity: 12000,
    isRebroadcast: false,
    genres: ["Action", "Drama"],
    studios: [{ id: 1, name: "Studio Example", siteUrl: "https://studio.example/" }],
    voiceActors: [
      {
        id: 9,
        name: "Sample VA",
        nativeName: "サンプル",
        language: "Japanese",
        imageUrl: "https://cdn.example.com/va.jpg",
        siteUrl: "https://anilist.co/staff/9",
        characterName: "Hero",
        characterRole: "MAIN"
      }
    ],
    reputation: {
      score: 78,
      scoreMax: 100,
      scoredBy: 5000,
      popularity: 12000,
      members: 20000,
      favourites: 300,
      trending: 10,
      rank: 50
    },
    airing: {
      startDate: "2026-07-01",
      broadcastDay: "Tuesday",
      broadcastTime: "23:00",
      broadcastTimezone: "Asia/Tokyo",
      broadcastText: "火曜 23:00",
      courEstimate: "1クール",
      nextEpisode: {
        episode: 3,
        airingAt: "2026-07-15T14:00:00.000Z",
        timeUntilAiringSeconds: 3600
      },
      recentEpisodes: [{ episode: 2, airingAt: "2026-07-08T14:00:00.000Z" }]
    },
    streamingEpisodes: [
      {
        title: "Episode 1",
        site: "Example",
        url: "https://stream.example.com/ep1"
      }
    ],
    streamingPlatforms: [
      {
        name: "ExampleFlix",
        url: "https://stream.example.com/",
        source: "anilist",
        region: "JP"
      }
    ],
    streamingProvidersJp: {
      flatrate: [
        {
          id: 8,
          name: "Netflix",
          logoUrl: "https://image.tmdb.org/t/p/original/netflix.png"
        }
      ],
      providerLink: "https://www.themoviedb.org/tv/1/watch"
    }
  });
}

const seasonal: AnimeItem[] = [
  makeAnime("101", "天幕のジャードゥーガル"),
  makeAnime("102", "無職転生Ⅲ ～異世界行ったら本気だす～"),
  makeAnime("201", "正反対な君と僕 第2期"),
  makeAnime("301", "グロウアップショウ ～ひまわりのサーカス団～"),
  makeAnime("401", "さよならララ"),
  makeAnime("501", "才女のお世話"),
  makeAnime("601", "炎の闘球女 ドッジ弾子"),
  makeAnime("701", "片田舎のおっさん、剣聖になるII")
];

const sevenRowImport = {
  version: BOARD_IMPORT_VERSION,
  season: "SUMMER",
  seasonYear: 2026,
  tiers: [
    {
      label: "SSS",
      color: "#e11d48",
      entries: [
        { id: "101", title: "天幕のジャードゥーガル" },
        { title: "無職転生Ⅲ ～異世界行ったら本気だす～" }
      ]
    },
    {
      label: "SS",
      color: "#f97316",
      entries: [{ title: "正反対な君と僕 第2期" }]
    },
    {
      label: "S",
      color: "#f87171",
      entries: [{ title: "グロウアップショウ ～ひまわりのサーカス団～" }]
    },
    {
      label: "A",
      color: "#fbbf24",
      entries: [{ title: "さよならララ" }, { titleUncertain: true }]
    },
    {
      label: "B",
      color: "#34d399",
      entries: [
        { title: "黄泉のツガイ" },
        { title: "黒猫と魔女の教室" },
        { title: "才女のお世話" }
      ]
    },
    {
      label: "C",
      color: "#60a5fa",
      entries: [{ title: "炎の闘球女 ドッジ弾子" }, { title: "LIAR GAME" }]
    },
    {
      label: "D",
      color: "#a78bfa",
      entries: [{ title: "片田舎のおっさん、剣聖になるII" }]
    }
  ]
};

test("seven ordered tiers round-trip without truncation", () => {
  const result = parseBoardDefinitionImport(JSON.stringify(sevenRowImport), seasonal);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const ranked = result.board.tiers.filter((tier) => tier.id !== BOARD_UNRANKED_TIER_ID);
  assert.equal(ranked.length, 7);
  assert.deepEqual(
    ranked.map((tier) => tier.label),
    ["SSS", "SS", "S", "A", "B", "C", "D"]
  );

  const reconciled = reconcileBoardWithCatalog(result.board, seasonal, 2026, "SUMMER");
  const rankedAfter = reconciled.tiers.filter((tier) => tier.id !== BOARD_UNRANKED_TIER_ID);
  assert.equal(rankedAfter.length, 7);
  assert.deepEqual(
    rankedAfter.map((tier) => tier.label),
    ["SSS", "SS", "S", "A", "B", "C", "D"]
  );
  assert.deepEqual(
    rankedAfter.map((tier) => tier.itemIds.length),
    ranked.map((tier) => tier.itemIds.length)
  );
});

test("31-slot seven-row fixture: counts, ids, reconcile, share items", () => {
  const result = parseBoardDefinitionImport(thirtyOneSlotFixtureRaw, seasonal);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const ranked = result.board.tiers.filter((tier) => tier.id !== BOARD_UNRANKED_TIER_ID);
  assert.equal(ranked.length, 7);
  assert.deepEqual(
    ranked.map((tier) => tier.label),
    ["SSS", "SS", "S", "A", "B", "C", "D"]
  );
  assert.deepEqual(
    ranked.map((tier) => tier.itemIds.length),
    [2, 3, 5, 8, 9, 3, 1]
  );

  const rankedIds = ranked.flatMap((tier) => tier.itemIds);
  assert.equal(rankedIds.length, 31);
  assert.equal(new Set(rankedIds).size, 31, "no duplicate ranked ids");

  // Known titles/order from original task must be present.
  const byId = new Map(result.items.map((item) => [item.id, item]));
  const sssTitles = ranked[0].itemIds.map((id) => byId.get(id)?.title);
  assert.deepEqual(sssTitles, [
    "天幕のジャードゥーガル",
    "無職転生Ⅲ ～異世界行ったら本気だす～"
  ]);
  assert.equal(byId.get(ranked[1].itemIds[0])?.title, "正反対な君と僕 第2期");
  assert.equal(byId.get(ranked[2].itemIds[0])?.title, "グロウアップショウ ～ひまわりのサーカス団～");
  assert.equal(byId.get(ranked[3].itemIds[0])?.title, "さよならララ");
  const bTitles = ranked[4].itemIds.slice(0, 3).map((id) => byId.get(id)?.title);
  assert.deepEqual(bTitles, ["黄泉のツガイ", "黒猫と魔女の教室", "才女のお世話"]);
  const cTitles = ranked[5].itemIds.slice(0, 2).map((id) => byId.get(id)?.title);
  assert.deepEqual(cTitles, ["炎の闘球女 ドッジ弾子", "LIAR GAME"]);
  assert.equal(byId.get(ranked[6].itemIds[0])?.title, "片田舎のおっさん、剣聖になるII");

  // Uncertain slots keep stable explicit IDs and never substitute catalog anime.
  const uncertainIds = rankedIds.filter((id) => id.startsWith("snapshot:uncertain-"));
  assert.ok(uncertainIds.length >= 20);
  for (const id of uncertainIds) {
    const item = byId.get(id);
    assert.ok(item, `missing item for ${id}`);
    assert.equal(item.titleUncertain, true);
    assert.equal(item.title, UNCERTAIN_TITLE_PLACEHOLDER);
    assert.ok(!seasonal.some((s) => s.id === id));
  }

  const reconciled = reconcileBoardWithCatalog(result.board, seasonal, 2026, "SUMMER");
  const rankedAfter = reconciled.tiers.filter((tier) => tier.id !== BOARD_UNRANKED_TIER_ID);
  assert.deepEqual(
    rankedAfter.map((tier) => tier.itemIds.length),
    [2, 3, 5, 8, 9, 3, 1]
  );
  assert.deepEqual(
    rankedAfter.flatMap((tier) => tier.itemIds),
    rankedIds,
    "no loss after reconcile"
  );

  const merged = mergeBoardItems(seasonal, reconciled.extraItems);
  const shareItems = collectShareItems(reconciled, merged);
  for (const id of rankedIds) {
    assert.ok(
      shareItems.some((item) => item.id === id),
      `share items must include ranked id ${id}`
    );
  }

  // items[] carries snapshots; board.extraItems omitted to keep id sets disjoint.
  const validated = validateSharePayload(
    { ...reconciled, extraItems: undefined },
    shareItems
  );
  assert.equal(validated.ok, true);
});

test("imported local-only board does not enable remote autosave (pure guard)", () => {
  assert.equal(
    shouldEnableRemoteBoardAutosave({
      isAuthenticated: true,
      protectLocalBoard: false,
      importShareIntentOnly: true
    }),
    false
  );
  assert.equal(
    shouldEnableRemoteBoardAutosave({
      isAuthenticated: true,
      protectLocalBoard: true,
      importShareIntentOnly: false
    }),
    false
  );
  assert.equal(
    shouldEnableRemoteBoardAutosave({
      isAuthenticated: false,
      protectLocalBoard: false,
      importShareIntentOnly: false
    }),
    false
  );
  assert.equal(
    shouldEnableRemoteBoardAutosave({
      isAuthenticated: true,
      protectLocalBoard: false,
      importShareIntentOnly: false
    }),
    true
  );
});

test("cross-season import does not substitute same-title item from wrong season", () => {
  // Displayed catalog is SPRING; import targets SUMMER with an exact same title.
  const springCatalog: AnimeItem[] = [
    makeAnime("spring-101", "天幕のジャードゥーガル", {
      season: "SPRING",
      seasonYear: 2026
    }),
    makeAnime("spring-201", "正反対な君と僕 第2期", {
      season: "SPRING",
      seasonYear: 2026
    })
  ];
  const summerOnlyTitle = {
    version: BOARD_IMPORT_VERSION,
    season: "SUMMER",
    seasonYear: 2026,
    tiers: [
      {
        label: "SSS",
        color: "#e11d48",
        entries: [{ title: "天幕のジャードゥーガル" }]
      }
    ]
  };

  const result = parseBoardDefinitionImport(
    JSON.stringify(summerOnlyTitle),
    springCatalog,
    { seasonYear: 2026, season: "SPRING" }
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const sss = result.board.tiers.find((tier) => tier.label === "SSS");
  assert.ok(sss);
  assert.equal(sss.itemIds.length, 1);
  // Must NOT take spring-101; create a snapshot instead.
  assert.notEqual(sss.itemIds[0], "spring-101");
  const snapshot = result.extraItems.find((item) => item.id === sss.itemIds[0]);
  assert.ok(snapshot, "missing-catalog title must become snapshot extra");
  assert.equal(snapshot.title, "天幕のジャードゥーガル");
  assert.equal(snapshot.snapshotOnly, true);

  // Target-season reconcile keeps the snapshot (no item loss).
  const summerCatalog: AnimeItem[] = [
    makeAnime("summer-101", "別作品", { season: "SUMMER", seasonYear: 2026 })
  ];
  const reconciled = reconcileBoardWithCatalog(
    result.board,
    summerCatalog,
    2026,
    "SUMMER"
  );
  const sssAfter = reconciled.tiers.find((tier) => tier.label === "SSS");
  assert.deepEqual(sssAfter?.itemIds, sss.itemIds);
  assert.ok(reconciled.extraItems?.some((item) => item.id === sss.itemIds[0]));
});

test("cross-target metadata-less same-title must not substitute current catalog", () => {
  // Displayed catalog lacks season metadata (legacy list), but UI is on SPRING.
  // Import targets SUMMER with the same title — must not bind to current catalog id.
  const legacyDisplayedCatalog: AnimeItem[] = [
    makeAnime("legacy-spring-101", "天幕のジャードゥーガル"),
    makeAnime("legacy-spring-201", "正反対な君と僕 第2期")
  ];
  const summerOnlyTitle = {
    version: BOARD_IMPORT_VERSION,
    season: "SUMMER",
    seasonYear: 2026,
    tiers: [
      {
        label: "SSS",
        color: "#e11d48",
        entries: [{ title: "天幕のジャードゥーガル" }]
      }
    ]
  };

  const result = parseBoardDefinitionImport(
    JSON.stringify(summerOnlyTitle),
    legacyDisplayedCatalog,
    { seasonYear: 2026, season: "SPRING" }
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const sss = result.board.tiers.find((tier) => tier.label === "SSS");
  assert.ok(sss);
  assert.equal(sss.itemIds.length, 1);
  assert.notEqual(sss.itemIds[0], "legacy-spring-101");
  const snapshot = result.extraItems.find((item) => item.id === sss.itemIds[0]);
  assert.ok(snapshot, "cross-target metadata-less title must become snapshot");
  assert.equal(snapshot.title, "天幕のジャードゥーガル");
  assert.equal(snapshot.snapshotOnly, true);
});

test("same-season catalog match still resolves exact title to catalog id", () => {
  const summerCatalog: AnimeItem[] = [
    makeAnime("101", "天幕のジャードゥーガル", {
      season: "SUMMER",
      seasonYear: 2026
    }),
    makeAnime("102", "無職転生Ⅲ ～異世界行ったら本気だす～", {
      season: "SUMMER",
      seasonYear: 2026
    })
  ];
  const payload = {
    version: BOARD_IMPORT_VERSION,
    season: "SUMMER",
    seasonYear: 2026,
    tiers: [
      {
        label: "SSS",
        entries: [{ title: "天幕のジャードゥーガル" }]
      }
    ]
  };
  const result = parseBoardDefinitionImport(JSON.stringify(payload), summerCatalog, {
    seasonYear: 2026,
    season: "SUMMER"
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const sss = result.board.tiers.find((tier) => tier.label === "SSS");
  assert.deepEqual(sss?.itemIds, ["101"]);
  assert.equal(
    result.extraItems.some((item) => item.id === "101"),
    false
  );
});

test("same-target legacy metadata-less exact title still resolves to catalog id", () => {
  const legacySameTarget: AnimeItem[] = [
    makeAnime("legacy-101", "天幕のジャードゥーガル"),
    makeAnime("legacy-102", "別作品")
  ];
  const payload = {
    version: BOARD_IMPORT_VERSION,
    season: "SUMMER",
    seasonYear: 2026,
    tiers: [
      {
        label: "SSS",
        entries: [{ title: "天幕のジャードゥーガル" }]
      }
    ]
  };
  const result = parseBoardDefinitionImport(JSON.stringify(payload), legacySameTarget, {
    seasonYear: 2026,
    season: "SUMMER"
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const sss = result.board.tiers.find((tier) => tier.label === "SSS");
  assert.deepEqual(sss?.itemIds, ["legacy-101"]);
  assert.equal(
    result.extraItems.some((item) => item.id === "legacy-101"),
    false
  );
});

test("filterCatalogForImportTarget excludes mismatched year/season only", () => {
  const mixed: AnimeItem[] = [
    makeAnime("a", "A", { season: "SUMMER", seasonYear: 2026 }),
    makeAnime("b", "B", { season: "SPRING", seasonYear: 2026 }),
    makeAnime("c", "C", { season: "SUMMER", seasonYear: 2025 }),
    makeAnime("d", "D") // no metadata — stays eligible on same-target / no context
  ];
  const filtered = filterCatalogForImportTarget(mixed, 2026, "SUMMER");
  assert.deepEqual(
    filtered.map((item) => item.id).sort(),
    ["a", "d"]
  );
  assert.equal(isCatalogItemForImportSeason(mixed[0], 2026, "SUMMER"), true);
  assert.equal(isCatalogItemForImportSeason(mixed[1], 2026, "SUMMER"), false);
  assert.equal(isCatalogItemForImportSeason(mixed[2], 2026, "SUMMER"), false);
  assert.equal(isCatalogItemForImportSeason(mixed[3], 2026, "SUMMER"), true);

  // Same-target context still keeps metadata-less rows.
  const sameTarget = filterCatalogForImportTarget(mixed, 2026, "SUMMER", {
    seasonYear: 2026,
    season: "SUMMER"
  });
  assert.deepEqual(
    sameTarget.map((item) => item.id).sort(),
    ["a", "d"]
  );

  // Cross-target: only positively known import-target items remain.
  const crossTarget = filterCatalogForImportTarget(mixed, 2026, "SUMMER", {
    seasonYear: 2026,
    season: "SPRING"
  });
  assert.deepEqual(
    crossTarget.map((item) => item.id).sort(),
    ["a"]
  );
  assert.equal(
    isCatalogItemForImportSeason(mixed[3], 2026, "SUMMER", {
      requireKnownTarget: true
    }),
    false
  );
  assert.equal(
    isCatalogItemForImportSeason(mixed[0], 2026, "SUMMER", {
      requireKnownTarget: true
    }),
    true
  );
});

test("import share-intent marker parse/serialize is bounded and strict", () => {
  const key = importShareIntentStorageKey(2026, "SUMMER");
  assert.match(key, /import-share-intent/);
  assert.match(key, /2026:SUMMER$/);

  const marker = createImportShareIntentMarker(
    2026,
    "SUMMER",
    "2026-08-01T00:00:00.000Z"
  );
  assert.equal(marker.version, IMPORT_SHARE_INTENT_MARKER_VERSION);
  const raw = serializeImportShareIntentMarker(marker);
  assert.ok(raw.length < MAX_IMPORT_SHARE_INTENT_MARKER_CHARS);

  const ok = parseImportShareIntentMarker(raw, 2026, "SUMMER");
  assert.ok(ok);
  assert.equal(ok?.year, 2026);
  assert.equal(ok?.season, "SUMMER");

  // Year/season mismatch (stale relative to key) → null
  assert.equal(parseImportShareIntentMarker(raw, 2026, "SPRING"), null);
  assert.equal(parseImportShareIntentMarker(raw, 2025, "SUMMER"), null);

  // Malformed / empty / oversized
  assert.equal(parseImportShareIntentMarker(null, 2026, "SUMMER"), null);
  assert.equal(parseImportShareIntentMarker("", 2026, "SUMMER"), null);
  assert.equal(parseImportShareIntentMarker("{not json", 2026, "SUMMER"), null);
  assert.equal(
    parseImportShareIntentMarker(JSON.stringify({ version: 99, year: 2026, season: "SUMMER", createdAt: "2026-08-01T00:00:00.000Z" }), 2026, "SUMMER"),
    null
  );
  assert.equal(
    parseImportShareIntentMarker(
      JSON.stringify({
        version: 1,
        year: 2026,
        season: "SUMMER",
        createdAt: "not-a-date"
      }),
      2026,
      "SUMMER"
    ),
    null
  );
  assert.equal(
    parseImportShareIntentMarker("x".repeat(MAX_IMPORT_SHARE_INTENT_MARKER_CHARS + 1), 2026, "SUMMER"),
    null
  );
  // Extra unknown fields are ignored if required fields are valid (strict shape via allowlist read).
  const withExtra = parseImportShareIntentMarker(
    JSON.stringify({
      version: 1,
      year: 2026,
      season: "SUMMER",
      createdAt: "2026-08-01T00:00:00.000Z",
      evil: true
    }),
    2026,
    "SUMMER"
  );
  assert.ok(withExtra);
  assert.equal(
    Object.prototype.hasOwnProperty.call(withExtra, "evil"),
    false
  );
});

test("utf8ByteLength measures bytes not UTF-16 code units", () => {
  const jp = "共有データが大きすぎます。";
  assert.ok(utf8ByteLength(jp) > jp.length);
  assert.equal(utf8ByteLength("abc"), 3);
  assert.ok(utf8ByteLength("あ") === 3);
});

test("missing-catalog snapshot entries survive reconcile and share payload", () => {
  const result = parseBoardDefinitionImport(JSON.stringify(sevenRowImport), seasonal);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const missingTitles = ["黄泉のツガイ", "黒猫と魔女の教室", "LIAR GAME"];
  for (const title of missingTitles) {
    const extra = result.extraItems.find((item) => item.title === title);
    assert.ok(extra, `expected snapshot for ${title}`);
    assert.equal(extra.snapshotOnly, true);
    assert.ok(!seasonal.some((item) => item.id === extra.id));
  }

  const reconciled = reconcileBoardWithCatalog(result.board, seasonal, 2026, "SUMMER");
  const bTier = reconciled.tiers.find((tier) => tier.label === "B");
  assert.ok(bTier);
  const bItems = bTier.itemIds.map(
    (id) =>
      seasonal.find((item) => item.id === id) ??
      reconciled.extraItems?.find((item) => item.id === id)
  );
  assert.equal(bItems[0]?.title, "黄泉のツガイ");
  assert.equal(bItems[1]?.title, "黒猫と魔女の教室");
  assert.equal(bItems[2]?.title, "才女のお世話");
  assert.equal(bItems[2]?.id, "501");

  const merged = mergeBoardItems(seasonal, reconciled.extraItems);
  const shareItems = collectShareItems(reconciled, merged);
  for (const title of missingTitles) {
    assert.ok(
      shareItems.some((item) => item.title === title),
      `share items must include ${title}`
    );
  }

  const validated = validateSharePayload(
    { ...reconciled, extraItems: undefined },
    shareItems
  );
  assert.equal(validated.ok, true);
});

test("ordering of custom entries is preserved", () => {
  const result = parseBoardDefinitionImport(JSON.stringify(sevenRowImport), seasonal);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const sss = result.board.tiers.find((tier) => tier.label === "SSS");
  assert.ok(sss);
  assert.equal(sss.itemIds[0], "101");
  assert.equal(sss.itemIds[1], "102");

  const cTier = result.board.tiers.find((tier) => tier.label === "C");
  assert.ok(cTier);
  const cTitles = cTier.itemIds.map(
    (id) =>
      result.items.find((item) => item.id === id)?.title ??
      result.extraItems.find((item) => item.id === id)?.title
  );
  assert.deepEqual(cTitles, ["炎の闘球女 ドッジ弾子", "LIAR GAME"]);
});

test("titleUncertain never substitutes a catalog anime", () => {
  const result = parseBoardDefinitionImport(JSON.stringify(sevenRowImport), seasonal);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const aTier = result.board.tiers.find((tier) => tier.label === "A");
  assert.ok(aTier);
  assert.equal(aTier.itemIds.length, 2);
  const uncertain = result.extraItems.find((item) => item.titleUncertain);
  assert.ok(uncertain);
  assert.equal(uncertain.title, UNCERTAIN_TITLE_PLACEHOLDER);
  assert.ok(aTier.itemIds.includes(uncertain.id));
  assert.ok(!seasonal.some((item) => item.id === uncertain.id));
});

test("invalid import is rejected with Japanese actionable feedback", () => {
  const invalidJson = parseBoardDefinitionImport("{not json", seasonal);
  assert.equal(invalidJson.ok, false);
  if (invalidJson.ok) return;
  assert.match(invalidJson.error, /JSON/);

  const badSeason = parseBoardDefinitionImport(
    JSON.stringify({ ...sevenRowImport, season: "SUMMER2026" }),
    seasonal
  );
  assert.equal(badSeason.ok, false);
  if (badSeason.ok) return;
  assert.match(badSeason.error, /season/);

  const emptyEntry = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [{ label: "S", entries: [{}] }]
    }),
    seasonal
  );
  assert.equal(emptyEntry.ok, false);
  if (emptyEntry.ok) return;
  assert.match(emptyEntry.error, /titleUncertain|title|id/);

  const missingItemId = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [{ label: "S", itemIds: ["missing-id-xyz"] }],
      items: []
    }),
    seasonal
  );
  assert.equal(missingItemId.ok, false);
  if (missingItemId.ok) return;
  assert.match(missingItemId.error, /存在しません/);
});

test("bounded validation rejects duplicate tier ids and cross-tier item ids", () => {
  const dupTier = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        { id: "tier-x", label: "S", color: "#f87171", entries: [{ title: "才女のお世話" }] },
        { id: "tier-x", label: "A", color: "#fbbf24", entries: [{ title: "さよならララ" }] }
      ]
    }),
    seasonal
  );
  assert.equal(dupTier.ok, false);
  if (dupTier.ok) return;
  assert.match(dupTier.error, /重複/);

  const crossTier = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        { label: "S", color: "#f87171", entries: [{ id: "101", title: "天幕のジャードゥーガル" }] },
        { label: "A", color: "#fbbf24", entries: [{ id: "101", title: "天幕のジャードゥーガル" }] }
      ]
    }),
    seasonal
  );
  assert.equal(crossTier.ok, false);
  if (crossTier.ok) return;
  assert.match(crossTier.error, /複数のTier/);
});

test("validateSharePayload rejects oversize fields and measures payload bytes", () => {
  const longTitle = "あ".repeat(201);
  const board: BoardWithSnapshots = {
    version: 1,
    season: "SUMMER",
    seasonYear: 2026,
    updatedAt: "2026-08-01T00:00:00.000Z",
    tiers: [{ id: "tier-s", label: "S", color: "#f87171", itemIds: ["x1"] }]
  };
  const rejected = validateSharePayload(board, [
    makeAnime("x1", longTitle, { snapshotOnly: true })
  ]);
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.match(rejected.error, /title|長すぎ/);

  const okBoard: BoardWithSnapshots = {
    version: 1,
    season: "SUMMER",
    seasonYear: 2026,
    updatedAt: "2026-08-01T00:00:00.000Z",
    tiers: [{ id: "tier-s", label: "S", color: "#f87171", itemIds: ["101"] }]
  };
  const accepted = validateSharePayload(okBoard, seasonal);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  const bytes = utf8ByteLength(JSON.stringify({ board: accepted.board, items: accepted.items }));
  assert.ok(bytes < MAX_SHARE_PAYLOAD_BYTES);
});

test("legacy seasonal-only board reconcile and share stay compatible", () => {
  const legacyBoard: BoardWithSnapshots = {
    version: 1,
    season: "SUMMER",
    seasonYear: 2026,
    updatedAt: "2026-08-01T00:00:00.000Z",
    tiers: [
      { id: "tier-s", label: "S", color: "#f87171", itemIds: ["101"] },
      { id: "tier-a", label: "A", color: "#fbbf24", itemIds: ["201"] },
      {
        id: BOARD_UNRANKED_TIER_ID,
        label: "未分類",
        color: "#9ca3af",
        itemIds: [],
        locked: true
      }
    ]
  };

  const reconciled = reconcileBoardWithCatalog(legacyBoard, seasonal, 2026, "SUMMER");
  assert.equal(reconciled.extraItems, undefined);
  const sTier = reconciled.tiers.find((tier) => tier.label === "S");
  assert.deepEqual(sTier?.itemIds, ["101"]);
  const unranked = reconciled.tiers.find((tier) => tier.id === BOARD_UNRANKED_TIER_ID);
  assert.ok(unranked);
  assert.ok(unranked.itemIds.includes("102"));
  assert.ok(unranked.itemIds.includes("701"));

  const shareItems = collectShareItems(reconciled, seasonal);
  const validated = validateSharePayload(reconciled, shareItems);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(validated.board.extraItems, undefined);
  assert.ok(validated.items.some((item) => item.id === "101"));
});

test("share validation rejects board itemIds missing from items (JP error)", () => {
  const yomi = makeAnime("snapshot:yomi", "黄泉のツガイ", { snapshotOnly: true });
  const boardMissing: BoardWithSnapshots = {
    version: 1,
    season: "SUMMER",
    seasonYear: 2026,
    updatedAt: "2026-08-01T00:00:00.000Z",
    tiers: [
      {
        id: "tier-b",
        label: "B",
        color: "#34d399",
        itemIds: ["snapshot:yomi"]
      }
    ]
  };

  const rejected = validateSharePayload(boardMissing, seasonal);
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.match(rejected.error, /items|extraItems|スナップショット/);

  // Snapshot may live in extraItems only (disjoint from items[]).
  const acceptedViaExtra = validateSharePayload(
    { ...boardMissing, extraItems: [yomi] },
    seasonal
  );
  assert.equal(acceptedViaExtra.ok, true);

  // Or live in items[] only.
  const acceptedViaItems = validateSharePayload(boardMissing, [...seasonal, yomi]);
  assert.equal(acceptedViaItems.ok, true);

  // Dual presence of the same id is always a collision.
  const dual = validateSharePayload(
    { ...boardMissing, extraItems: [yomi] },
    [...seasonal, yomi]
  );
  assert.equal(dual.ok, false);
  if (dual.ok) return;
  assert.match(dual.error, /衝突/);
});

test("share-like items[] import keeps custom snapshot ids and seven rows", () => {
  const custom = makeAnime("snapshot:liar-game", "LIAR GAME", { snapshotOnly: true });
  const payload = {
    version: 1,
    season: "SUMMER",
    seasonYear: 2026,
    tiers: [
      { id: "tier-sss", label: "SSS", color: "#e11d48", itemIds: ["101"] },
      { id: "tier-ss", label: "SS", color: "#f97316", itemIds: [] },
      { id: "tier-s", label: "S", color: "#f87171", itemIds: [] },
      { id: "tier-a", label: "A", color: "#fbbf24", itemIds: [] },
      { id: "tier-b", label: "B", color: "#34d399", itemIds: [] },
      { id: "tier-c", label: "C", color: "#60a5fa", itemIds: [custom.id] },
      { id: "tier-d", label: "D", color: "#a78bfa", itemIds: [] }
    ],
    items: [seasonal[0], custom]
  };

  const result = parseBoardDefinitionImport(JSON.stringify(payload), seasonal);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.extraItems.some((item) => item.id === custom.id),
    true
  );
  const cTier = result.board.tiers.find((tier) => tier.label === "C");
  assert.deepEqual(cTier?.itemIds, [custom.id]);

  const reconciled = reconcileBoardWithCatalog(result.board, seasonal, 2026, "SUMMER");
  const cAfter = reconciled.tiers.find((tier) => tier.label === "C");
  assert.deepEqual(cAfter?.itemIds, [custom.id]);
});

test("board-snapshot module has no server/node crypto imports", () => {
  const source = readFileSync(join(fixtureDir, "..", "lib", "board-snapshot.ts"), "utf8");
  const importLines = source
    .split(/\r?\n/)
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");
  assert.doesNotMatch(importLines, /node:crypto|turso|@libsql|TURSO_/i);
  assert.doesNotMatch(importLines, /from ["']\.\/shares/);
  assert.match(importLines, /from ["']\.\/types\.ts["']/);
});

function baseShareBoard(
  overrides: Partial<BoardWithSnapshots> = {}
): BoardWithSnapshots {
  return {
    version: 1,
    season: "SUMMER",
    seasonYear: 2026,
    updatedAt: "2026-08-01T00:00:00.000Z",
    tiers: [{ id: "tier-s", label: "S", color: "#f87171", itemIds: ["101"] }],
    ...overrides
  };
}

test("URL validation rejects unsafe schemes and accepts https + image-proxy path", () => {
  const board = baseShareBoard();

  const rejectCases: Array<{ label: string; imageUrl: string }> = [
    { label: "javascript", imageUrl: "javascript:alert(1)" },
    { label: "data", imageUrl: "data:image/png;base64,aaaa" },
    { label: "file", imageUrl: "file:///etc/passwd" },
    { label: "malformed", imageUrl: "not a url at all" },
    { label: "protocol-relative", imageUrl: "//evil.example/x.jpg" },
    { label: "credentials", imageUrl: "https://user:pass@example.com/a.jpg" },
    { label: "overlong", imageUrl: `https://example.com/${"a".repeat(2100)}.jpg` },
    { label: "https-no-slashes", imageUrl: "https:example.com" },
    { label: "http-no-slashes", imageUrl: "http:example.com" },
    { label: "leading-space", imageUrl: " https://example.com/a.jpg" },
    { label: "trailing-space", imageUrl: "https://example.com/a.jpg " },
    { label: "fragment", imageUrl: "https://example.com/a.jpg#x" },
    { label: "malformed-percent", imageUrl: "https://example.com/%zz" },
    { label: "default-port", imageUrl: "https://example.com:443/a.jpg" },
    { label: "uppercase-host-norm", imageUrl: "https://Example.COM/a.jpg" }
  ];

  for (const { label, imageUrl } of rejectCases) {
    const rejected = validateSharePayload(board, [
      makeAnime("101", "天幕のジャードゥーガル", { imageUrl, proxiedImageUrl: imageUrl })
    ]);
    assert.equal(rejected.ok, false, `expected reject for ${label}`);
    if (rejected.ok) return;
    assert.match(rejected.error, /imageUrl|proxiedImageUrl|URL|url|https|長すぎ|正規|パーセント|空白|フラグメント|ポート/i);
  }

  const controlChar = validateSharePayload(board, [
    makeAnime("101", "天幕のジャードゥーガル", {
      imageUrl: "https://example.com/\u0000evil.jpg"
    })
  ]);
  assert.equal(controlChar.ok, false);

  const acceptedHttps = validateSharePayload(board, [
    makeAnime("101", "天幕のジャードゥーガル", {
      imageUrl: "https://cdn.example.com/poster.jpg",
      proxiedImageUrl: "https://cdn.example.com/poster.jpg",
      siteUrl: "https://anilist.co/anime/101"
    })
  ]);
  assert.equal(acceptedHttps.ok, true, "valid https must pass");

  const acceptedProxy = validateSharePayload(board, [
    makeAnime("101", "天幕のジャードゥーガル", {
      imageUrl: "https://cdn.example.com/poster.jpg",
      proxiedImageUrl: "/api/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Fposter.jpg",
      siteUrl: "http://example.com/anime/101"
    })
  ]);
  assert.equal(acceptedProxy.ok, true, "root-relative image-proxy must pass");

  const rejectProxyCases: Array<{ label: string; proxiedImageUrl: string }> = [
    { label: "other-relative", proxiedImageUrl: "/api/other-proxy?url=https%3A%2F%2Fx.com%2Fa.jpg" },
    { label: "path-suffix", proxiedImageUrl: "/api/image-proxy/extra?url=https%3A%2F%2Fx.com%2Fa.jpg" },
    { label: "bare-path", proxiedImageUrl: "/api/image-proxy" },
    { label: "fragment", proxiedImageUrl: "/api/image-proxy?url=https%3A%2F%2Fx.com%2Fa.jpg#x" },
    { label: "missing-url-param", proxiedImageUrl: "/api/image-proxy?foo=1" },
    { label: "http-nested", proxiedImageUrl: "/api/image-proxy?url=http%3A%2F%2Fx.com%2Fa.jpg" },
    { label: "malformed-query-percent", proxiedImageUrl: "/api/image-proxy?url=https%3A%2F%2Fx.com%2F%zz" },
    { label: "protocol-relative-proxy", proxiedImageUrl: "//api/image-proxy?url=https%3A%2F%2Fx.com%2Fa.jpg" }
  ];
  for (const { label, proxiedImageUrl } of rejectProxyCases) {
    const rejected = validateSharePayload(board, [
      makeAnime("101", "天幕のジャードゥーガル", { proxiedImageUrl })
    ]);
    assert.equal(rejected.ok, false, `expected reject for proxy ${label}`);
  }

  const importJs = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "S",
          entries: [
            {
              title: "カスタム作品",
              imageUrl: "javascript:alert(1)"
            }
          ]
        }
      ]
    }),
    seasonal
  );
  assert.equal(importJs.ok, false);
  if (importJs.ok) return;
  assert.match(importJs.error, /imageUrl|http|https|URL/i);
});

test("extraItems validation is atomic and rejects duplicates/collisions", () => {
  const goodExtra = makeAnime("snapshot:yomi", "黄泉のツガイ", {
    snapshotOnly: true
  });

  // Disjoint: snapshot only in extraItems (not items[]).
  const validBoard = baseShareBoard({
    tiers: [{ id: "tier-b", label: "B", color: "#34d399", itemIds: ["snapshot:yomi"] }],
    extraItems: [goodExtra]
  });
  const accepted = validateSharePayload(validBoard, seasonal);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.board.extraItems?.length, 1);
  assert.equal(accepted.board.extraItems?.[0]?.id, "snapshot:yomi");
  assert.equal(accepted.board.extraItems?.[0]?.title, "黄泉のツガイ");

  // Malformed entry must reject entire payload (no silent drop of the bad one).
  const malformedBoard = baseShareBoard({
    tiers: [{ id: "tier-b", label: "B", color: "#34d399", itemIds: ["101"] }],
    extraItems: [
      goodExtra,
      { id: "", title: "broken" } as AnimeItem,
      makeAnime("snapshot:ok2", "OK2", { snapshotOnly: true })
    ]
  });
  const malformed = validateSharePayload(malformedBoard, seasonal);
  assert.equal(malformed.ok, false);
  if (malformed.ok) return;
  assert.match(malformed.error, /extraItems|id/);

  const unsafeUrlExtra = baseShareBoard({
    tiers: [{ id: "tier-b", label: "B", color: "#34d399", itemIds: ["101"] }],
    extraItems: [
      makeAnime("snapshot:evil", "Evil", {
        snapshotOnly: true,
        imageUrl: "data:text/html,<script>1</script>"
      })
    ]
  });
  const unsafe = validateSharePayload(unsafeUrlExtra, seasonal);
  assert.equal(unsafe.ok, false);

  const dupExtra = baseShareBoard({
    tiers: [{ id: "tier-b", label: "B", color: "#34d399", itemIds: ["101"] }],
    extraItems: [
      makeAnime("snapshot:dup", "A", { snapshotOnly: true }),
      makeAnime("snapshot:dup", "B", { snapshotOnly: true })
    ]
  });
  const dup = validateSharePayload(dupExtra, seasonal);
  assert.equal(dup.ok, false);
  if (dup.ok) return;
  assert.match(dup.error, /重複|extraItems/);

  // Same id in items + extraItems with different title → collision
  const collisionBoard = baseShareBoard({
    tiers: [{ id: "tier-s", label: "S", color: "#f87171", itemIds: ["101"] }],
    extraItems: [
      makeAnime("101", "別タイトル", {
        snapshotOnly: true,
        imageUrl: "https://example.com/other.jpg",
        proxiedImageUrl: "https://example.com/other.jpg",
        siteUrl: "https://example.com/other"
      })
    ]
  });
  const collision = validateSharePayload(collisionBoard, seasonal);
  assert.equal(collision.ok, false);
  if (collision.ok) return;
  assert.match(collision.error, /衝突/);

  // Same id + same title in both is still a collision (not allowed by title match).
  const overlapping = validateSharePayload(
    baseShareBoard({
      tiers: [{ id: "tier-b", label: "B", color: "#34d399", itemIds: [goodExtra.id] }],
      extraItems: [goodExtra]
    }),
    [goodExtra]
  );
  assert.equal(overlapping.ok, false);
  if (overlapping.ok) return;
  assert.match(overlapping.error, /衝突/);
});

test("share board root rejects invalid version/seasonYear/updatedAt/tiers/locked", () => {
  const items = seasonal;

  const badVersion = validateSharePayload(
    baseShareBoard({ version: 2 as BoardWithSnapshots["version"] }),
    items
  );
  assert.equal(badVersion.ok, false);
  if (badVersion.ok) return;
  assert.match(badVersion.error, /version/);

  const fractionalYear = validateSharePayload(
    baseShareBoard({ seasonYear: 2026.5 as BoardWithSnapshots["seasonYear"] }),
    items
  );
  assert.equal(fractionalYear.ok, false);
  if (fractionalYear.ok) return;
  assert.match(fractionalYear.error, /seasonYear/);

  const outOfRangeYear = validateSharePayload(
    baseShareBoard({ seasonYear: 1800 }),
    items
  );
  assert.equal(outOfRangeYear.ok, false);
  if (outOfRangeYear.ok) return;
  assert.match(outOfRangeYear.error, /seasonYear/);

  const badUpdatedAt = validateSharePayload(
    baseShareBoard({ updatedAt: "not-a-timestamp" }),
    items
  );
  assert.equal(badUpdatedAt.ok, false);
  if (badUpdatedAt.ok) return;
  assert.match(badUpdatedAt.error, /updatedAt/);

  const emptyTiers = validateSharePayload(baseShareBoard({ tiers: [] }), items);
  assert.equal(emptyTiers.ok, false);
  if (emptyTiers.ok) return;
  assert.match(emptyTiers.error, /tiers/);

  const nonBooleanLocked = validateSharePayload(
    baseShareBoard({
      tiers: [
        {
          id: "tier-s",
          label: "S",
          color: "#f87171",
          itemIds: ["101"],
          locked: "yes" as unknown as boolean
        }
      ]
    }),
    items
  );
  assert.equal(nonBooleanLocked.ok, false);
  if (nonBooleanLocked.ok) return;
  assert.match(nonBooleanLocked.error, /locked/);

  const okLocked = validateSharePayload(
    baseShareBoard({
      tiers: [
        {
          id: "tier-s",
          label: "S",
          color: "#f87171",
          itemIds: ["101"],
          locked: false
        }
      ]
    }),
    items
  );
  assert.equal(okLocked.ok, true);

  // Strict UTC timestamps only — reject Date.parse-loose values.
  for (const updatedAt of [
    "2026",
    "2026-08-01",
    "2026-08-01T00:00:00.000+00:00",
    "2026-02-30T00:00:00.000Z",
    "2026-13-01T00:00:00.000Z",
    "not-a-timestamp",
    "2026-08-01T00:00:00.000Z" + "0".repeat(40)
  ]) {
    const bad = validateSharePayload(baseShareBoard({ updatedAt }), items);
    assert.equal(bad.ok, false, `expected reject updatedAt=${updatedAt}`);
    if (bad.ok) return;
    assert.match(bad.error, /updatedAt/);
  }

  const secondsOnly = validateSharePayload(
    baseShareBoard({ updatedAt: "2026-08-01T00:00:00Z" }),
    items
  );
  assert.equal(secondsOnly.ok, true, "whole-second Z form must pass");
});

test("import entry validation rejects non-boolean titleUncertain and bad id/title", () => {
  const coerced = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "S",
          entries: [{ titleUncertain: "yes" }]
        }
      ]
    }),
    seasonal
  );
  assert.equal(coerced.ok, false);
  if (coerced.ok) return;
  assert.match(coerced.error, /titleUncertain|boolean/);

  const controlId = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "S",
          entries: [{ id: "bad\u0001id", title: "カスタム" }]
        }
      ]
    }),
    seasonal
  );
  assert.equal(controlId.ok, false);
  if (controlId.ok) return;
  assert.match(controlId.error, /id|制御/);

  const controlTitle = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "S",
          entries: [{ title: "a\u0007b" }]
        }
      ]
    }),
    seasonal
  );
  assert.equal(controlTitle.ok, false);

  // Atomic: one bad entry rejects the whole import (no partial board).
  const partial = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "S",
          entries: [
            { id: "101", title: "天幕のジャードゥーガル" },
            { titleUncertain: 1 }
          ]
        }
      ]
    }),
    seasonal
  );
  assert.equal(partial.ok, false);
});

test("AnimeItem nested validation accepts realistic shape and rejects invalid/oversized", () => {
  const board = baseShareBoard({
    tiers: [{ id: "tier-s", label: "S", color: "#f87171", itemIds: ["nested-1"] }]
  });
  const good = realisticNestedAnime("nested-1", "ネスト検証");
  const accepted = validateSharePayload(board, [good]);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  // Rebuilt allowlisted object — unknown keys must not leak through.
  const returned = accepted.items[0] as AnimeItem & { evil?: unknown };
  assert.equal(returned.evil, undefined);
  assert.equal(returned.streamingProvidersJp?.flatrate[0]?.name, "Netflix");
  assert.equal(returned.voiceActors?.[0]?.name, "Sample VA");
  assert.deepEqual(returned.genres, ["Action", "Drama"]);

  const withUnknown = validateSharePayload(board, [
    { ...good, evil: { nested: true }, __proto__: { polluted: true } } as AnimeItem
  ]);
  assert.equal(withUnknown.ok, true);
  if (!withUnknown.ok) return;
  assert.equal(
    Object.prototype.hasOwnProperty.call(withUnknown.items[0], "evil"),
    false
  );

  const badNestedCases: Array<{ label: string; item: AnimeItem }> = [
    {
      label: "bad-genre-control",
      item: makeAnime("nested-1", "x", { genres: ["ok", "bad\u0000"] })
    },
    {
      label: "too-many-genres",
      item: makeAnime("nested-1", "x", {
        genres: Array.from({ length: 40 }, (_, i) => `g${i}`)
      })
    },
    {
      label: "bad-streaming-url",
      item: makeAnime("nested-1", "x", {
        streamingEpisodes: [{ url: "javascript:alert(1)" }]
      })
    },
    {
      label: "bad-provider-logo",
      item: makeAnime("nested-1", "x", {
        streamingProvidersJp: {
          flatrate: [{ id: 1, name: "X", logoUrl: "data:image/png;base64,xx" }]
        }
      })
    },
    {
      label: "oversized-flatrate",
      item: makeAnime("nested-1", "x", {
        streamingProvidersJp: {
          flatrate: Array.from({ length: 40 }, (_, i) => ({
            id: i,
            name: `P${i}`,
            logoUrl: null
          }))
        }
      })
    },
    {
      label: "bad-season-enum",
      item: makeAnime("nested-1", "x", { season: "RAINY" as AnimeItem["season"] })
    },
    {
      label: "non-boolean-snapshotOnly",
      item: makeAnime("nested-1", "x", {
        snapshotOnly: "yes" as unknown as boolean
      })
    },
    {
      label: "titles-invalid-type",
      item: makeAnime("nested-1", "x", {
        titles: { userPreferred: 123 as unknown as string }
      })
    }
  ];

  for (const { label, item } of badNestedCases) {
    const rejected = validateSharePayload(board, [item]);
    assert.equal(rejected.ok, false, `expected reject for ${label}`);
  }

  // Import path also applies nested/URL validation atomically.
  const importBadNested = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [{ label: "S", itemIds: ["nested-1"] }],
      items: [
        makeAnime("nested-1", "x", {
          streamingPlatforms: [{ name: "X", url: "https:example.com" }]
        })
      ]
    }),
    seasonal
  );
  assert.equal(importBadNested.ok, false);
});

test("exact catalog title match only; padded/case/space variants do not substitute", () => {
  const catalog = [
    ...seasonal,
    makeAnime("liar-catalog", "LIAR GAME")
  ];

  const exact = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [{ label: "C", entries: [{ title: "LIAR GAME" }] }]
    }),
    catalog
  );
  assert.equal(exact.ok, true);
  if (!exact.ok) return;
  assert.equal(exact.board.tiers[0]?.itemIds[0], "liar-catalog");
  assert.equal(
    exact.extraItems.some((item) => item.id === "liar-catalog"),
    false,
    "exact catalog title substitutes and does not create snapshot"
  );

  // Case / space-collapsed variants must NOT substitute catalog (create snapshot instead).
  for (const title of ["liargame", "liar game", "Liar Game", "LIAR  GAME"]) {
    const variant = parseBoardDefinitionImport(
      JSON.stringify({
        version: 1,
        season: "SUMMER",
        seasonYear: 2026,
        tiers: [{ label: "C", entries: [{ title }] }]
      }),
      catalog
    );
    assert.equal(variant.ok, true, `expected accept non-matching title ${JSON.stringify(title)}`);
    if (!variant.ok) return;
    assert.notEqual(variant.board.tiers[0]?.itemIds[0], "liar-catalog");
    const snap = variant.extraItems.find((item) => item.title === title);
    assert.ok(snap, `expected snapshot for ${JSON.stringify(title)}`);
    assert.equal(snap.snapshotOnly, true);
  }

  // Padded title is rejected (lexical rule), not trimmed into catalog identity.
  const paddedTitle = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [{ label: "C", entries: [{ title: " LIAR GAME " }] }]
    }),
    catalog
  );
  assert.equal(paddedTitle.ok, false);
  if (paddedTitle.ok) return;
  assert.match(paddedTitle.error, /title|空白/);

  // String-form entry: exact match ok; padded rejected; case variant is snapshot.
  const exactString = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [{ label: "C", entries: ["LIAR GAME"] }]
    }),
    catalog
  );
  assert.equal(exactString.ok, true);
  if (!exactString.ok) return;
  assert.equal(exactString.board.tiers[0]?.itemIds[0], "liar-catalog");

  const paddedString = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [{ label: "C", entries: [" LIAR GAME "] }]
    }),
    catalog
  );
  assert.equal(paddedString.ok, false);

  // titleUncertain never substitutes even when title would match catalog.
  const uncertain = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "C",
          entries: [{ title: "LIAR GAME", titleUncertain: true }]
        }
      ]
    }),
    catalog
  );
  assert.equal(uncertain.ok, true);
  if (!uncertain.ok) return;
  assert.notEqual(uncertain.board.tiers[0]?.itemIds[0], "liar-catalog");
  const u = uncertain.extraItems.find((item) => item.titleUncertain);
  assert.ok(u);
  assert.equal(u.title, UNCERTAIN_TITLE_PLACEHOLDER);
  assert.ok(u.id.startsWith("snapshot:uncertain-"));
});

test("padded import id/title rejected atomically", () => {
  const paddedId = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "S",
          entries: [
            { id: "101", title: "天幕のジャードゥーガル" },
            { id: " 102 ", title: "無職転生Ⅲ ～異世界行ったら本気だす～" }
          ]
        }
      ]
    }),
    seasonal
  );
  assert.equal(paddedId.ok, false, "one padded id rejects whole import");
  if (paddedId.ok) return;
  assert.match(paddedId.error, /id|空白/);

  const paddedTitleOnly = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "S",
          entries: [{ title: " 才女のお世話" }]
        }
      ]
    }),
    seasonal
  );
  assert.equal(paddedTitleOnly.ok, false);
  if (paddedTitleOnly.ok) return;
  assert.match(paddedTitleOnly.error, /title|空白/);

  const paddedUncertainId = parseBoardDefinitionImport(
    JSON.stringify({
      version: 1,
      season: "SUMMER",
      seasonYear: 2026,
      tiers: [
        {
          label: "S",
          entries: [{ id: " custom ", titleUncertain: true }]
        }
      ]
    }),
    seasonal
  );
  assert.equal(paddedUncertainId.ok, false);

  // Share payload also rejects padded id/title.
  const board = baseShareBoard({
    tiers: [{ id: "tier-s", label: "S", color: "#f87171", itemIds: ["x1"] }]
  });
  const paddedShareId = validateSharePayload(board, [
    makeAnime(" x1 ", "ok", { snapshotOnly: true })
  ]);
  assert.equal(paddedShareId.ok, false);

  const paddedShareTitle = validateSharePayload(board, [
    makeAnime("x1", " padded ", { snapshotOnly: true })
  ]);
  assert.equal(paddedShareTitle.ok, false);
});

test("nested airing/provider/studio/voice-actor numeric bounds", () => {
  const board = baseShareBoard({
    tiers: [{ id: "tier-s", label: "S", color: "#f87171", itemIds: ["nested-num"] }]
  });
  const base = realisticNestedAnime("nested-num", "数値境界");

  const okRealistic = validateSharePayload(board, [base]);
  assert.equal(okRealistic.ok, true, "realistic nested numerics accepted");
  if (!okRealistic.ok) return;
  assert.equal(
    okRealistic.items[0]?.airing?.nextEpisode?.timeUntilAiringSeconds,
    3600
  );
  assert.equal(okRealistic.items[0]?.streamingProvidersJp?.flatrate[0]?.id, 8);
  assert.equal(okRealistic.items[0]?.studios?.[0]?.id, 1);
  assert.equal(okRealistic.items[0]?.voiceActors?.[0]?.id, 9);

  const okZeroTime = validateSharePayload(board, [
    {
      ...base,
      airing: {
        ...base.airing!,
        nextEpisode: {
          episode: 1,
          airingAt: "2026-07-15T14:00:00.000Z",
          timeUntilAiringSeconds: 0
        }
      }
    }
  ]);
  assert.equal(okZeroTime.ok, true, "timeUntilAiringSeconds=0 accepted");

  const okMaxTime = validateSharePayload(board, [
    {
      ...base,
      airing: {
        ...base.airing!,
        nextEpisode: {
          episode: 1,
          airingAt: "2026-07-15T14:00:00.000Z",
          timeUntilAiringSeconds: MAX_TIME_UNTIL_AIRING_SECONDS
        }
      }
    }
  ]);
  assert.equal(okMaxTime.ok, true, "max bound timeUntil accepted");

  const rejectCases: Array<{ label: string; item: AnimeItem }> = [
    {
      label: "time-negative",
      item: {
        ...base,
        airing: {
          ...base.airing!,
          nextEpisode: {
            episode: 1,
            airingAt: "2026-07-15T14:00:00.000Z",
            timeUntilAiringSeconds: -1
          }
        }
      }
    },
    {
      label: "time-fractional",
      item: {
        ...base,
        airing: {
          ...base.airing!,
          nextEpisode: {
            episode: 1,
            airingAt: "2026-07-15T14:00:00.000Z",
            timeUntilAiringSeconds: 1.5
          }
        }
      }
    },
    {
      label: "time-over-bound",
      item: {
        ...base,
        airing: {
          ...base.airing!,
          nextEpisode: {
            episode: 1,
            airingAt: "2026-07-15T14:00:00.000Z",
            timeUntilAiringSeconds: MAX_TIME_UNTIL_AIRING_SECONDS + 1
          }
        }
      }
    },
    {
      label: "time-unsafe",
      item: {
        ...base,
        airing: {
          ...base.airing!,
          nextEpisode: {
            episode: 1,
            airingAt: "2026-07-15T14:00:00.000Z",
            timeUntilAiringSeconds: Number.MAX_SAFE_INTEGER + 1
          }
        }
      }
    },
    {
      label: "provider-negative",
      item: {
        ...base,
        streamingProvidersJp: {
          flatrate: [{ id: -1, name: "X", logoUrl: null }]
        }
      }
    },
    {
      label: "provider-fractional",
      item: {
        ...base,
        streamingProvidersJp: {
          flatrate: [{ id: 1.2, name: "X", logoUrl: null }]
        }
      }
    },
    {
      label: "provider-unsafe",
      item: {
        ...base,
        streamingProvidersJp: {
          flatrate: [
            {
              id: Number.MAX_SAFE_INTEGER + 10,
              name: "X",
              logoUrl: null
            }
          ]
        }
      }
    },
    {
      label: "studio-negative",
      item: {
        ...base,
        studios: [{ id: -3, name: "Studio" }]
      }
    },
    {
      label: "studio-fractional",
      item: {
        ...base,
        studios: [{ id: 2.5, name: "Studio" }]
      }
    },
    {
      label: "va-negative",
      item: {
        ...base,
        voiceActors: [{ id: -9, name: "VA" }]
      }
    },
    {
      label: "va-fractional",
      item: {
        ...base,
        voiceActors: [{ id: 9.1, name: "VA" }]
      }
    },
    {
      label: "va-over-max-entity",
      item: {
        ...base,
        voiceActors: [{ id: MAX_EXTERNAL_ENTITY_ID + 1, name: "VA" }]
      }
    }
  ];

  for (const { label, item } of rejectCases) {
    const rejected = validateSharePayload(board, [item]);
    assert.equal(rejected.ok, false, `expected reject for ${label}`);
  }
});
