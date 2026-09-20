import {
  LAB_NOW_ISO,
  resolveExpiry,
  resolveLegalWatch,
  type SavedWork
} from "./model.ts";

export { LAB_NOW_ISO };

export const MY_LIST_FIXTURES: SavedWork[] = [
  {
    id: "uw-frieren",
    titleNative: "葬送のフリーレン",
    titleRomaji: "Sousou no Frieren",
    status: "watching",
    watchedEpisodes: 8,
    latestKnownEpisode: 28,
    lastTouchedAt: "2026-09-18T09:00:00.000Z",
    savedAt: "2026-08-01T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-teal)",
    expiry: resolveExpiry({
      expiresAt: "2027-03-31T15:00:00.000Z",
      sourceName: "Netflix",
      sourceUrl: "https://www.netflix.com/title/frieren",
      region: "JP",
      checkedAt: "2026-09-19T03:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "Netflix",
      url: "https://www.netflix.com/title/frieren",
      region: "JP",
      checkedAt: "2026-09-19T03:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "uw-kusuriya",
    titleNative: "薬屋のひとりごと",
    titleRomaji: "Kusuriya no Hitorigoto",
    status: "planned",
    watchedEpisodes: 0,
    latestKnownEpisode: 24,
    lastTouchedAt: "2026-09-12T08:00:00.000Z",
    savedAt: "2026-09-12T08:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-rose)",
    expiry: resolveExpiry({
      expiresAt: "2027-01-15T15:00:00.000Z",
      sourceName: "U-NEXT",
      sourceUrl: "https://video.unext.jp/title/kusuriya",
      region: "JP",
      checkedAt: "2026-09-18T04:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "U-NEXT",
      url: "https://video.unext.jp/title/kusuriya",
      region: "JP",
      checkedAt: "2026-09-18T04:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "dm-heike",
    titleNative: "平家物語",
    titleRomaji: "Heike Monogatari",
    status: "paused",
    watchedEpisodes: 3,
    latestKnownEpisode: 11,
    lastTouchedAt: "2026-04-01T00:00:00.000Z",
    savedAt: "2025-12-01T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-amber)",
    expiry: resolveExpiry({
      expiresAt: "2027-12-31T15:00:00.000Z",
      sourceName: "Amazon Prime Video",
      sourceUrl: "https://www.amazon.co.jp/primevideo/heike",
      region: "JP",
      checkedAt: "2026-09-10T02:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "Amazon Prime Video",
      url: "https://www.amazon.co.jp/primevideo/heike",
      region: "JP",
      checkedAt: "2026-09-10T02:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "dm-yojo",
    titleNative: "四畳半神話大系",
    titleRomaji: "Yojouhan Shinwa Taikei",
    status: "watching",
    watchedEpisodes: 2,
    latestKnownEpisode: null,
    lastTouchedAt: "2026-01-15T00:00:00.000Z",
    savedAt: "2025-06-20T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-violet)",
    expiry: resolveExpiry({
      expiresAt: "2028-01-01T00:00:00.000Z",
      sourceName: "Crunchyroll",
      sourceUrl: "https://www.crunchyroll.com/series/yojo",
      region: "JP",
      checkedAt: "2026-09-01T00:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "Crunchyroll",
      url: "https://www.crunchyroll.com/series/yojo",
      region: "JP",
      checkedAt: "2026-09-01T00:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "ex-mujica",
    titleNative: "BanG Dream! Ave Mujica",
    titleRomaji: null,
    status: "watching",
    watchedEpisodes: 6,
    latestKnownEpisode: 13,
    lastTouchedAt: "2026-09-16T11:00:00.000Z",
    savedAt: "2026-07-01T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-pink)",
    expiry: resolveExpiry({
      expiresAt: "2026-09-25T15:00:00.000Z",
      sourceName: "ABEMA",
      sourceUrl: "https://abema.tv/video/title/mujica",
      region: "JP",
      checkedAt: "2026-09-19T06:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "ABEMA",
      url: "https://abema.tv/video/title/mujica",
      region: "JP",
      checkedAt: "2026-09-19T06:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "ex-witch",
    titleNative: "魔法少女にあこがれて",
    titleRomaji: "Mahou Shoujo ni Akogarete",
    status: "planned",
    watchedEpisodes: 0,
    latestKnownEpisode: 13,
    lastTouchedAt: "2026-09-14T07:00:00.000Z",
    savedAt: "2026-09-14T07:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-indigo)",
    expiry: resolveExpiry({
      expiresAt: "2026-10-04T12:00:00.000Z",
      sourceName: "Disney+",
      sourceUrl: "https://www.disneyplus.com/series/akogare",
      region: "JP",
      checkedAt: "2026-09-20T01:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "Disney+",
      url: "https://www.disneyplus.com/series/akogare",
      region: "JP",
      checkedAt: "2026-09-20T01:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "fail-region",
    titleNative: "ダンジョン飯",
    titleRomaji: "Dungeon Meshi",
    status: "watching",
    watchedEpisodes: 4,
    latestKnownEpisode: null,
    lastTouchedAt: "2026-09-17T00:00:00.000Z",
    savedAt: "2026-08-20T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-emerald)",
    expiry: resolveExpiry({
      expiresAt: "2026-09-22T15:00:00.000Z",
      sourceName: "Netflix",
      sourceUrl: "https://www.netflix.com/title/dungeon",
      region: null,
      checkedAt: "2026-09-19T00:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "Netflix",
      url: "https://www.netflix.com/title/dungeon",
      region: null,
      checkedAt: "2026-09-19T00:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "fail-source",
    titleNative: "忘却バッテリー",
    titleRomaji: "Boukyaku Battery",
    status: "planned",
    watchedEpisodes: 0,
    latestKnownEpisode: null,
    lastTouchedAt: "2026-09-11T00:00:00.000Z",
    savedAt: "2026-09-11T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-sky)",
    expiry: resolveExpiry({
      expiresAt: "2026-09-23T15:00:00.000Z",
      sourceName: null,
      sourceUrl: "https://www.netflix.com/title/battery",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: null,
      url: "https://www.netflix.com/title/battery",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "fail-checked",
    titleNative: "チ。 ―地球の運動について―",
    titleRomaji: "Chi. Chikyuu no Undou ni Tsuite",
    status: "watching",
    watchedEpisodes: 1,
    latestKnownEpisode: null,
    lastTouchedAt: "2026-09-15T00:00:00.000Z",
    savedAt: "2026-09-01T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-cyan)",
    expiry: resolveExpiry({
      expiresAt: "2026-09-24T15:00:00.000Z",
      sourceName: "U-NEXT",
      sourceUrl: "https://video.unext.jp/title/chi",
      region: "JP",
      checkedAt: null
    }),
    legalWatch: resolveLegalWatch({
      providerName: "U-NEXT",
      url: "https://video.unext.jp/title/chi",
      region: "JP",
      checkedAt: null,
      watchForm: "字幕"
    })
  },
  {
    id: "fail-date",
    titleNative: "少女革命ウテナ",
    titleRomaji: "Shoujo Kakumei Utena",
    status: "paused",
    watchedEpisodes: 5,
    latestKnownEpisode: null,
    lastTouchedAt: "2026-03-01T00:00:00.000Z",
    savedAt: "2025-11-01T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-red)",
    expiry: resolveExpiry({
      expiresAt: null,
      sourceName: "Crunchyroll",
      sourceUrl: "https://www.crunchyroll.com/series/utena",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "Crunchyroll",
      url: "https://www.crunchyroll.com/series/utena",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "fail-unofficial",
    titleNative: "新世紀エヴァンゲリオン",
    titleRomaji: "Neon Genesis Evangelion",
    status: "planned",
    watchedEpisodes: 0,
    latestKnownEpisode: null,
    lastTouchedAt: "2026-02-01T00:00:00.000Z",
    savedAt: "2025-09-01T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-indigo)",
    expiry: resolveExpiry({
      expiresAt: "2026-09-22T15:00:00.000Z",
      sourceName: "動画検索",
      sourceUrl: "https://search.example.invalid/eva",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "動画検索",
      url: "https://search.example.invalid/eva",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "fail-spoof-host",
    titleNative: "ホスト偽装の検証作",
    titleRomaji: null,
    status: "watching",
    watchedEpisodes: 1,
    latestKnownEpisode: null,
    lastTouchedAt: "2026-09-18T00:00:00.000Z",
    savedAt: "2026-09-18T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-red)",
    expiry: resolveExpiry({
      expiresAt: "2026-09-22T15:00:00.000Z",
      sourceName: "Netflix",
      sourceUrl: "https://www.netflix.com.evil/title/spoof-host",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "Netflix",
      url: "https://www.netflix.com.evil/title/spoof-host",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z",
      watchForm: "字幕"
    })
  },
  {
    id: "fail-spoof-userinfo",
    titleNative: "認証情報偽装の検証作",
    titleRomaji: null,
    status: "planned",
    watchedEpisodes: 0,
    latestKnownEpisode: null,
    lastTouchedAt: "2026-09-17T00:00:00.000Z",
    savedAt: "2026-09-17T00:00:00.000Z",
    posterTone: "var(--anime-card-placeholder-tone-amber)",
    expiry: resolveExpiry({
      expiresAt: "2026-09-23T15:00:00.000Z",
      sourceName: "Netflix",
      sourceUrl: "https://www.netflix.com@evil.example/title/spoof-userinfo",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z"
    }),
    legalWatch: resolveLegalWatch({
      providerName: "Netflix",
      url: "https://www.netflix.com@evil.example/title/spoof-userinfo",
      region: "JP",
      checkedAt: "2026-09-19T00:00:00.000Z",
      watchForm: "字幕"
    })
  }
];
