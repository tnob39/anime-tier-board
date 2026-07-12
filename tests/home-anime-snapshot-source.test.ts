import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createHomeAnimeSnapshotSource,
  type HomeAnimeSnapshotSourceOptions
} from "../lib/home-anime-snapshot-source.ts";
import type { AnimeItem } from "../lib/types.ts";

const BASE_MS = Date.parse("2026-07-12T12:00:00.000Z");

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

function createHarness(options: {
  ttlMs: number;
  load: HomeAnimeSnapshotSourceOptions["load"];
  initialNow?: number;
}) {
  let currentNow = options.initialNow ?? BASE_MS;
  const source = createHomeAnimeSnapshotSource({
    ttlMs: options.ttlMs,
    now: () => currentNow,
    load: options.load
  });
  return {
    source,
    setNow(value: number) {
      currentNow = value;
    }
  };
}

test("AC1: invalid ttlMs throws RangeError; zero is accepted", () => {
  const load = async () => [makeAnime("a1")];
  const now = () => BASE_MS;

  for (const ttlMs of [-1, Infinity, NaN, 1.5] as const) {
    assert.throws(
      () => createHomeAnimeSnapshotSource({ ttlMs, now, load }),
      RangeError
    );
  }

  assert.doesNotThrow(() =>
    createHomeAnimeSnapshotSource({ ttlMs: 0, now, load })
  );
});

test("AC2: first success is fresh, preserves order, and does not reuse loader array", async () => {
  const a1 = makeAnime("a1");
  const a2 = makeAnime("a2");
  const loaderArray: AnimeItem[] = [a1, a2];
  let loadCalls = 0;

  const harness = createHarness({
    ttlMs: 1000,
    load: async () => {
      loadCalls += 1;
      return loaderArray;
    }
  });

  const snapshot = await harness.source.getSnapshot();
  assert.equal(snapshot.freshness, "fresh");
  assert.ok(snapshot.items !== null);
  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.items[0]?.id, "a1");
  assert.equal(snapshot.items[1]?.id, "a2");
  assert.notEqual(snapshot.items, loaderArray);

  loaderArray.push(makeAnime("a3"));
  assert.equal(snapshot.items.length, 2);
  assert.equal(loadCalls, 1);
});

test("AC3: before expiry reuses cache; exactly at expiry refreshes", async () => {
  const first = [makeAnime("first")];
  const second = [makeAnime("second")];
  let loadCalls = 0;

  const harness = createHarness({
    ttlMs: 1000,
    load: async () => {
      loadCalls += 1;
      return loadCalls === 1 ? first : second;
    }
  });

  const initial = await harness.source.getSnapshot();
  assert.equal(initial.freshness, "fresh");
  assert.equal(initial.items?.[0]?.id, "first");
  assert.equal(loadCalls, 1);

  harness.setNow(BASE_MS + 999);
  const reused = await harness.source.getSnapshot();
  assert.equal(reused.freshness, "fresh");
  assert.equal(reused.items?.[0]?.id, "first");
  assert.equal(loadCalls, 1);
  assert.equal(reused.items, initial.items);

  harness.setNow(BASE_MS + 1000);
  const refreshed = await harness.source.getSnapshot();
  assert.equal(refreshed.freshness, "fresh");
  assert.equal(refreshed.items?.[0]?.id, "second");
  assert.equal(loadCalls, 2);
  assert.notEqual(refreshed.items, initial.items);
});

test("AC4: first load rejection is unavailable and next call retries", async () => {
  let loadCalls = 0;
  const harness = createHarness({
    ttlMs: 1000,
    load: async () => {
      loadCalls += 1;
      if (loadCalls === 1) {
        throw new Error("network down");
      }
      return [makeAnime("recovered")];
    }
  });

  const first = await harness.source.getSnapshot();
  assert.deepEqual(first, { freshness: "unavailable", items: null });
  assert.equal(loadCalls, 1);

  const second = await harness.source.getSnapshot();
  assert.equal(second.freshness, "fresh");
  assert.equal(second.items?.[0]?.id, "recovered");
  assert.equal(loadCalls, 2);
});

test("AC5: rejected refresh returns stale prior items and retries each later call", async () => {
  let loadCalls = 0;
  const original = [makeAnime("cached", { title: "Cached Title" })];

  const harness = createHarness({
    ttlMs: 100,
    load: async () => {
      loadCalls += 1;
      if (loadCalls === 1) {
        return original;
      }
      throw new Error("refresh failed");
    }
  });

  const success = await harness.source.getSnapshot();
  assert.equal(success.freshness, "fresh");
  assert.equal(success.items?.[0]?.id, "cached");
  assert.equal(success.items?.[0]?.title, "Cached Title");

  harness.setNow(BASE_MS + 100);
  const stale1 = await harness.source.getSnapshot();
  assert.equal(stale1.freshness, "stale");
  assert.equal(stale1.items?.[0]?.id, "cached");
  assert.equal(stale1.items?.[0]?.title, "Cached Title");
  assert.equal(stale1.items, success.items);
  assert.equal(loadCalls, 2);

  harness.setNow(BASE_MS + 200);
  const stale2 = await harness.source.getSnapshot();
  assert.equal(stale2.freshness, "stale");
  assert.equal(stale2.items, success.items);
  assert.equal(loadCalls, 3);

  harness.setNow(BASE_MS + 300);
  const stale3 = await harness.source.getSnapshot();
  assert.equal(stale3.freshness, "stale");
  assert.equal(stale3.items, success.items);
  assert.equal(loadCalls, 4);
});

test("AC6: successful call after stale replaces cache and returns fresh", async () => {
  let loadCalls = 0;
  const harness = createHarness({
    ttlMs: 50,
    load: async () => {
      loadCalls += 1;
      if (loadCalls === 1) {
        return [makeAnime("old")];
      }
      if (loadCalls === 2) {
        throw new Error("temporary");
      }
      return [makeAnime("new")];
    }
  });

  const first = await harness.source.getSnapshot();
  assert.equal(first.items?.[0]?.id, "old");

  harness.setNow(BASE_MS + 50);
  const stale = await harness.source.getSnapshot();
  assert.equal(stale.freshness, "stale");
  assert.equal(stale.items?.[0]?.id, "old");

  harness.setNow(BASE_MS + 100);
  const recovered = await harness.source.getSnapshot();
  assert.equal(recovered.freshness, "fresh");
  assert.equal(recovered.items?.[0]?.id, "new");
  assert.notEqual(recovered.items, first.items);
  assert.equal(loadCalls, 3);

  harness.setNow(BASE_MS + 120);
  const reused = await harness.source.getSnapshot();
  assert.equal(reused.freshness, "fresh");
  assert.equal(reused.items?.[0]?.id, "new");
  assert.equal(loadCalls, 3);
});

test("AC7: concurrent miss/expiry share one loader call; later expiry can call again", async () => {
  let loadCalls = 0;
  let resolveLoad: ((items: readonly AnimeItem[]) => void) | null = null;

  const harness = createHarness({
    ttlMs: 1000,
    load: () => {
      loadCalls += 1;
      return new Promise<readonly AnimeItem[]>((resolve) => {
        resolveLoad = resolve;
      });
    }
  });

  const p1 = harness.source.getSnapshot();
  const p2 = harness.source.getSnapshot();
  const p3 = harness.source.getSnapshot();

  assert.equal(loadCalls, 1);
  assert.ok(resolveLoad !== null);
  resolveLoad([makeAnime("batch1")]);

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.equal(r1.freshness, "fresh");
  assert.equal(r2.freshness, "fresh");
  assert.equal(r3.freshness, "fresh");
  assert.equal(r1.items?.[0]?.id, "batch1");
  assert.equal(r2.items, r1.items);
  assert.equal(r3.items, r1.items);
  assert.equal(loadCalls, 1);

  harness.setNow(BASE_MS + 1000);
  resolveLoad = null;
  const e1 = harness.source.getSnapshot();
  const e2 = harness.source.getSnapshot();
  assert.equal(loadCalls, 2);
  assert.ok(resolveLoad !== null);
  resolveLoad([makeAnime("batch2")]);

  const [er1, er2] = await Promise.all([e1, e2]);
  assert.equal(er1.freshness, "fresh");
  assert.equal(er2.freshness, "fresh");
  assert.equal(er1.items?.[0]?.id, "batch2");
  assert.equal(er2.items, er1.items);
  assert.equal(loadCalls, 2);
});

test("AC7b: concurrent failures resolve consistently to unavailable or stale", async () => {
  let loadCalls = 0;
  let rejectLoad: ((error: Error) => void) | null = null;

  const harness = createHarness({
    ttlMs: 1000,
    load: () => {
      loadCalls += 1;
      return new Promise<readonly AnimeItem[]>((_resolve, reject) => {
        rejectLoad = reject;
      });
    }
  });

  const p1 = harness.source.getSnapshot();
  const p2 = harness.source.getSnapshot();
  assert.equal(loadCalls, 1);
  assert.ok(rejectLoad !== null);
  rejectLoad(new Error("boom"));

  const [u1, u2] = await Promise.all([p1, p2]);
  assert.deepEqual(u1, { freshness: "unavailable", items: null });
  assert.deepEqual(u2, { freshness: "unavailable", items: null });

  let loadCalls2 = 0;
  let rejectRefresh: ((error: Error) => void) | null = null;
  let phase: "ok" | "fail" = "ok";

  const harness2 = createHarness({
    ttlMs: 10,
    load: () => {
      loadCalls2 += 1;
      if (phase === "ok") {
        return Promise.resolve([makeAnime("seed")]);
      }
      return new Promise<readonly AnimeItem[]>((_resolve, reject) => {
        rejectRefresh = reject;
      });
    }
  });

  const seeded = await harness2.source.getSnapshot();
  assert.equal(seeded.freshness, "fresh");
  phase = "fail";
  harness2.setNow(BASE_MS + 10);

  const s1 = harness2.source.getSnapshot();
  const s2 = harness2.source.getSnapshot();
  assert.equal(loadCalls2, 2);
  assert.ok(rejectRefresh !== null);
  rejectRefresh(new Error("refresh boom"));

  const [st1, st2] = await Promise.all([s1, s2]);
  assert.equal(st1.freshness, "stale");
  assert.equal(st2.freshness, "stale");
  assert.equal(st1.items, seeded.items);
  assert.equal(st2.items, seeded.items);
});

test("ttlMs zero refreshes on every non-concurrent call", async () => {
  let loadCalls = 0;
  const harness = createHarness({
    ttlMs: 0,
    load: async () => {
      loadCalls += 1;
      return [makeAnime(`n${loadCalls}`)];
    }
  });

  const first = await harness.source.getSnapshot();
  assert.equal(first.items?.[0]?.id, "n1");

  const second = await harness.source.getSnapshot();
  assert.equal(second.items?.[0]?.id, "n2");
  assert.equal(loadCalls, 2);
});

test("post-load now() error rejects without cache, clears in-flight, and allows retry", async () => {
  let loadCalls = 0;
  let nowCalls = 0;
  let phase: "clock-fail" | "load-fail" | "load-ok" = "clock-fail";
  const clockError = new Error("clock failure");

  const source = createHomeAnimeSnapshotSource({
    ttlMs: 1000,
    now: () => {
      nowCalls += 1;
      // Call 1: isFresh. Call 2: post-load fetchedAt during clock-fail phase.
      if (phase === "clock-fail" && nowCalls === 2) {
        throw clockError;
      }
      return BASE_MS;
    },
    load: async () => {
      loadCalls += 1;
      if (phase === "load-fail") {
        throw new Error("network down");
      }
      return [makeAnime(`n${loadCalls}`)];
    }
  });

  // Load succeeds; post-load now() throws → reject original error (not stale/unavailable).
  await assert.rejects(
    () => source.getSnapshot(),
    (err: unknown) => err === clockError
  );
  assert.equal(loadCalls, 1);

  // In-flight cleared and no successful cache: loader failure → unavailable (not stale).
  phase = "load-fail";
  const unavailable = await source.getSnapshot();
  assert.deepEqual(unavailable, { freshness: "unavailable", items: null });
  assert.equal(loadCalls, 2);

  // Later retry invokes load again and establishes a fresh cache.
  phase = "load-ok";
  const recovered = await source.getSnapshot();
  assert.equal(recovered.freshness, "fresh");
  assert.equal(recovered.items?.[0]?.id, "n3");
  assert.equal(loadCalls, 3);

  const reused = await source.getSnapshot();
  assert.equal(reused.freshness, "fresh");
  assert.equal(reused.items, recovered.items);
  assert.equal(loadCalls, 3);
});
