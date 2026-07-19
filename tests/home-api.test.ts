import assert from "node:assert/strict";
import module from "node:module";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  createHomeApi,
  type HomeApiDependencies,
  type HomeResponse
} from "../lib/home-api.ts";
import type { HomeAnimeSnapshot } from "../lib/home-next-action-candidates.ts";
import type { AnimeStatusRecord, ViewingStatus } from "../lib/statuses.ts";
import type { AnimeItem, StreamingProvider } from "../lib/types.ts";

const NOW = new Date("2026-07-12T12:00:00.000Z");
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
}): AnimeStatusRecord {
  return {
    animeId: input.animeId,
    status: input.status ?? "watching",
    anime: input.anime === undefined ? makeAnime(input.animeId) : input.anime,
    favoriteLevel: null,
    watchSlot: null,
    notes: null,
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

function responseKeys(response: HomeResponse): string[] {
  return Object.keys(response).sort();
}

function createTestApi(
  overrides: Partial<HomeApiDependencies> & {
    records?: AnimeStatusRecord[];
    listStatusesImpl?: HomeApiDependencies["listStatuses"];
  } = {}
) {
  const {
    records = [],
    listStatusesImpl,
    ...rest
  } = overrides;

  const statusesCache = rest.statusesCache ?? new Map<string, AnimeStatusRecord[]>();
  let nowCalls = 0;

  const api = createHomeApi({
    listStatuses:
      listStatusesImpl ??
      (async () => records),
    getSeasonalSnapshot: rest.getSeasonalSnapshot ?? (async () => UNAVAILABLE),
    getStreamingSnapshot: rest.getStreamingSnapshot ?? (async () => UNAVAILABLE),
    now:
      rest.now ??
      (() => {
        nowCalls += 1;
        return NOW;
      }),
    statusesCache
  });

  return { api, statusesCache, getNowCalls: () => nowCalls };
}

test("response exposes exactly generatedAt, freshness, nextActions, week", async () => {
  const { api, getNowCalls } = createTestApi({
    records: [
      makeRecord({
        animeId: "a1",
        status: "watching",
        watchedEpisodes: 1,
        updatedAt: "2026-07-10T00:00:00.000Z"
      })
    ]
  });

  const response = await api.getHome("user-1");
  assert.deepEqual(responseKeys(response), [
    "freshness",
    "generatedAt",
    "nextActions",
    "week"
  ]);
  assert.equal(response.generatedAt, NOW.toISOString());
  assert.equal(getNowCalls(), 1);
  assert.deepEqual(response.freshness, {
    statuses: "fresh",
    seasonal: "unavailable",
    streaming: "unavailable"
  });
});

test("independent freshness: statuses/seasonal/streaming can diverge", async () => {
  const seasonalItem = makeAnime("a1", {
    airing: {
      recentEpisodes: [
        { episode: 4, airingAt: new Date(NOW.getTime() - DAY_MS).toISOString() }
      ]
    }
  });
  const streamingItem = makeAnime("a1", {
    streamingProvidersJp: {
      flatrate: [{ id: 8, name: "Netflix", logoUrl: null }]
    }
  });

  const { api } = createTestApi({
    records: [
      makeRecord({
        animeId: "a1",
        status: "watching",
        watchedEpisodes: 2,
        updatedAt: "2026-07-08T00:00:00.000Z"
      })
    ],
    getSeasonalSnapshot: async () => freshSnapshot([seasonalItem]),
    getStreamingSnapshot: async () => staleSnapshot([streamingItem])
  });

  const response = await api.getHome("user-1");
  assert.deepEqual(response.freshness, {
    statuses: "fresh",
    seasonal: "fresh",
    streaming: "stale"
  });
  assert.ok(response.nextActions.length >= 1);
  assert.equal(response.nextActions[0]?.availabilityConfidence, "confirmed");
  assert.equal(response.nextActions[0]?.provider?.name, "Netflix");
});

test("external seasonal/streaming failure preserves saved statuses", async () => {
  const saved = makeRecord({
    animeId: "saved-1",
    status: "watching",
    watchedEpisodes: 3,
    updatedAt: "2026-07-05T00:00:00.000Z",
    anime: makeAnime("saved-1", { title: "Saved Show" })
  });

  const { api } = createTestApi({
    records: [saved],
    getSeasonalSnapshot: async () => UNAVAILABLE,
    getStreamingSnapshot: async () => UNAVAILABLE
  });

  const response = await api.getHome("user-1");
  assert.equal(response.freshness.statuses, "fresh");
  assert.equal(response.freshness.seasonal, "unavailable");
  assert.equal(response.freshness.streaming, "unavailable");
  assert.ok(response.nextActions.some((action) => action.anime.id === "saved-1"));
  assert.equal(response.nextActions[0]?.anime.title, "Saved Show");
  assert.equal(response.nextActions[0]?.watchedEpisodes, 3);
});

test("stale status fallback uses per-user cache after listStatuses failure", async () => {
  const cachedRecord = makeRecord({
    animeId: "cached-1",
    status: "planned",
    updatedAt: "2026-07-02T00:00:00.000Z"
  });
  let calls = 0;
  const statusesCache = new Map<string, AnimeStatusRecord[]>();

  const { api } = createTestApi({
    statusesCache,
    listStatusesImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return [cachedRecord];
      }
      throw new Error("db down");
    },
    getSeasonalSnapshot: async () => UNAVAILABLE,
    getStreamingSnapshot: async () => UNAVAILABLE
  });

  const first = await api.getHome("user-a");
  assert.equal(first.freshness.statuses, "fresh");
  assert.ok(first.nextActions.some((a) => a.anime.id === "cached-1"));

  const second = await api.getHome("user-a");
  assert.equal(second.freshness.statuses, "stale");
  assert.ok(second.nextActions.some((a) => a.anime.id === "cached-1"));
  assert.equal(second.freshness.seasonal, "unavailable");
  assert.equal(second.freshness.streaming, "unavailable");
});

test("no-cache statuses failure rejects without inventing empty payload", async () => {
  const { api } = createTestApi({
    listStatusesImpl: async () => {
      throw new Error("db unavailable");
    },
    getSeasonalSnapshot: async () => freshSnapshot([makeAnime("s1")]),
    getStreamingSnapshot: async () => freshSnapshot([makeAnime("s1")])
  });

  await assert.rejects(() => api.getHome("user-nocache"), /db unavailable/);
});

test("unknown availability never claims numeric unwatched episodes or 未記録N話", async () => {
  const { api } = createTestApi({
    records: [
      makeRecord({
        animeId: "u1",
        status: "watching",
        watchedEpisodes: 2,
        updatedAt: "2026-07-11T00:00:00.000Z"
      })
    ],
    getSeasonalSnapshot: async () => UNAVAILABLE,
    getStreamingSnapshot: async () => UNAVAILABLE
  });

  const response = await api.getHome("user-1");
  const action = response.nextActions.find((a) => a.anime.id === "u1");
  assert.ok(action);
  assert.equal(action.availabilityConfidence, "unknown");
  assert.equal(action.latestAvailableEpisode, null);
  assert.equal(action.unwatchedEpisodes, null);
  assert.equal(action.reasonLabel.includes("未記録"), false);
  assert.match(action.reasonLabel, /視聴中|最近更新/);
  assert.equal(/\d+話/.test(action.reasonLabel), false);
});

test("nextActions are deterministic and always have reasonLabel", async () => {
  const provider: StreamingProvider = {
    id: 8,
    name: "Netflix",
    logoUrl: null
  };
  const seasonal = makeAnime("b1", {
    airing: {
      recentEpisodes: [
        {
          episode: 5,
          airingAt: new Date(NOW.getTime() - 2 * DAY_MS).toISOString()
        }
      ]
    }
  });
  const streaming = makeAnime("b1", {
    streamingProvidersJp: { flatrate: [provider] }
  });

  const records = [
    makeRecord({
      animeId: "b1",
      status: "watching",
      watchedEpisodes: 3,
      updatedAt: "2026-07-01T00:00:00.000Z"
    }),
    makeRecord({
      animeId: "b4",
      status: "planned",
      updatedAt: "2026-06-01T00:00:00.000Z"
    }),
    makeRecord({
      animeId: "b2",
      status: "watching",
      watchedEpisodes: 1,
      updatedAt: "2026-07-10T00:00:00.000Z",
      anime: makeAnime("b2", {
        airing: {
          recentEpisodes: [
            {
              episode: 2,
              airingAt: new Date(NOW.getTime() - DAY_MS).toISOString()
            }
          ]
        }
      })
    })
  ];

  const { api } = createTestApi({
    records,
    getSeasonalSnapshot: async () => freshSnapshot([seasonal]),
    getStreamingSnapshot: async () => freshSnapshot([streaming])
  });

  const first = await api.getHome("user-1");
  const second = await api.getHome("user-1");

  assert.equal(JSON.stringify(first.nextActions), JSON.stringify(second.nextActions));
  assert.ok(first.nextActions.length >= 2);
  for (const action of first.nextActions) {
    assert.equal(typeof action.reasonLabel, "string");
    assert.ok(action.reasonLabel.length > 0);
  }

  const top = first.nextActions[0];
  assert.ok(top);
  assert.equal(top.anime.id, "b1");
  assert.equal(top.availabilityConfidence, "confirmed");
  assert.equal(top.unwatchedEpisodes, 2);
  assert.equal(top.reasonLabel, "未記録のエピソードが2話あります");
  assert.equal(top.provider?.id, 8);
});

test("week still builds from statuses when seasonal is unavailable", async () => {
  const airingAt = "2026-07-13T06:00:00.000Z"; // Mon 15:00 JST under NOW
  const { api } = createTestApi({
    records: [
      makeRecord({
        animeId: "w1",
        status: "watching",
        watchedEpisodes: 1,
        updatedAt: "2026-07-01T00:00:00.000Z",
        anime: makeAnime("w1", {
          airing: {
            nextEpisode: { episode: 2, airingAt }
          }
        })
      }),
      makeRecord({
        animeId: "completed-skip",
        status: "completed",
        updatedAt: "2026-07-01T00:00:00.000Z"
      })
    ],
    getSeasonalSnapshot: async () => UNAVAILABLE,
    getStreamingSnapshot: async () => freshSnapshot([makeAnime("w1")])
  });

  const response = await api.getHome("user-1");
  assert.equal(response.freshness.seasonal, "unavailable");
  assert.equal(response.freshness.streaming, "fresh");
  assert.ok(response.week.length >= 1);
  assert.ok(response.week.every((item) => item.anime.id !== "completed-skip"));
  assert.ok(response.week.some((item) => item.anime.id === "w1"));
  assert.ok(response.week.every((item) => item.status === "watching" || item.status === "planned"));
});

test("statuses freshness stays independent when external snapshots are stale", async () => {
  const seasonal = makeAnime("a1", {
    airing: {
      recentEpisodes: [
        { episode: 3, airingAt: new Date(NOW.getTime() - DAY_MS).toISOString() }
      ]
    }
  });

  const { api } = createTestApi({
    records: [
      makeRecord({
        animeId: "a1",
        status: "watching",
        watchedEpisodes: 1,
        updatedAt: "2026-07-09T00:00:00.000Z"
      })
    ],
    getSeasonalSnapshot: async () => staleSnapshot([seasonal]),
    getStreamingSnapshot: async () => UNAVAILABLE
  });

  const response = await api.getHome("user-1");
  assert.deepEqual(response.freshness, {
    statuses: "fresh",
    seasonal: "stale",
    streaming: "unavailable"
  });
  assert.equal(response.nextActions[0]?.availabilityConfidence, "estimated");
});

type HomeRouteTestHarness = {
  callOrder: string[];
  authUserId: string;
  homePayload: HomeResponse;
  jsonResponse: { __tag: "home-route-json-response"; payload: HomeResponse };
  jsonArg: unknown;
  getHomeUserId: string | undefined;
  onWithApiRoute: (
    name: string,
    handler: (request: Request) => Promise<unknown>
  ) => (request: Request) => Promise<unknown>;
  onRequireUserId: () => Promise<string>;
  onGetHome: (userId: string) => Promise<HomeResponse>;
  onJson: (data: unknown) => HomeRouteTestHarness["jsonResponse"];
};

declare global {
  // eslint-disable-next-line no-var
  var __homeRouteTest: HomeRouteTestHarness | undefined;
}

test("route GET loads app/api/home/route.ts and composes requireUserId -> getHome -> NextResponse.json", async () => {
  const authUserId = "auth-user-atb-447-e1";
  const homePayload: HomeResponse = {
    generatedAt: "2026-07-12T12:00:00.000Z",
    freshness: {
      statuses: "fresh",
      seasonal: "unavailable",
      streaming: "unavailable"
    },
    nextActions: [],
    week: []
  };
  const jsonResponse = {
    __tag: "home-route-json-response" as const,
    payload: homePayload
  };
  const callOrder: string[] = [];

  const harness: HomeRouteTestHarness = {
    callOrder,
    authUserId,
    homePayload,
    jsonResponse,
    jsonArg: undefined,
    getHomeUserId: undefined,
    onWithApiRoute(name, handler) {
      callOrder.push(`withApiRoute:${name}`);
      return async (request) => handler(request);
    },
    onRequireUserId() {
      callOrder.push("requireUserId");
      return Promise.resolve(authUserId);
    },
    onGetHome(userId) {
      callOrder.push("getHome");
      harness.getHomeUserId = userId;
      return Promise.resolve(homePayload);
    },
    onJson(data) {
      callOrder.push("NextResponse.json");
      harness.jsonArg = data;
      return jsonResponse;
    }
  };

  globalThis.__homeRouteTest = harness;

  const mockSpecifiers: Record<string, string> = {
    "next/server": "atb-home-route-mock:next/server",
    "@/lib/api/auth-helpers": "atb-home-route-mock:auth-helpers",
    "@/lib/api/with-api-route": "atb-home-route-mock:with-api-route",
    "@/lib/home-api": "atb-home-route-mock:home-api"
  };

  const hooks = module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const mockUrl = mockSpecifiers[specifier];
      if (mockUrl !== undefined) {
        return {
          shortCircuit: true,
          url: mockUrl,
          format: "module"
        };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === "atb-home-route-mock:next/server") {
        return {
          format: "module",
          shortCircuit: true,
          source: `
            const t = globalThis.__homeRouteTest;
            export const NextResponse = {
              json(data) {
                return t.onJson(data);
              }
            };
          `
        };
      }
      if (url === "atb-home-route-mock:auth-helpers") {
        return {
          format: "module",
          shortCircuit: true,
          source: `
            const t = globalThis.__homeRouteTest;
            export async function requireUserId() {
              return t.onRequireUserId();
            }
          `
        };
      }
      if (url === "atb-home-route-mock:with-api-route") {
        return {
          format: "module",
          shortCircuit: true,
          source: `
            const t = globalThis.__homeRouteTest;
            export function withApiRoute(name, handler) {
              return t.onWithApiRoute(name, handler);
            }
          `
        };
      }
      if (url === "atb-home-route-mock:home-api") {
        return {
          format: "module",
          shortCircuit: true,
          source: `
            const t = globalThis.__homeRouteTest;
            export async function getHome(userId) {
              return t.onGetHome(userId);
            }
          `
        };
      }
      return nextLoad(url, context);
    }
  });

  try {
    const routeUrl = pathToFileURL(
      path.resolve("app/api/home/route.ts")
    ).href;
    const route = await import(routeUrl);

    assert.equal(route.dynamic, "force-dynamic");
    assert.equal(typeof route.GET, "function");
    assert.ok(
      callOrder.includes("withApiRoute:home.GET"),
      "route module must compose GET via withApiRoute('home.GET', ...)"
    );

    const result = await route.GET(new Request("http://localhost/api/home"));

    assert.equal(harness.getHomeUserId, authUserId);
    assert.deepEqual(harness.jsonArg, homePayload);
    assert.equal(result, jsonResponse);
    assert.deepEqual(callOrder, [
      "withApiRoute:home.GET",
      "requireUserId",
      "getHome",
      "NextResponse.json"
    ]);
  } finally {
    const maybeDeregister = hooks as { deregister?: () => void };
    maybeDeregister.deregister?.();
    delete globalThis.__homeRouteTest;
  }
});
