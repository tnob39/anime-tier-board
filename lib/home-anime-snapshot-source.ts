import type { HomeAnimeSnapshot } from "./home-next-action-candidates";
import type { AnimeItem } from "./types";

export type HomeAnimeSnapshotSourceOptions = {
  ttlMs: number;
  now: () => number;
  load: () => Promise<readonly AnimeItem[]>;
};

export type HomeAnimeSnapshotSource = {
  getSnapshot: () => Promise<HomeAnimeSnapshot>;
};

export function createHomeAnimeSnapshotSource(
  options: HomeAnimeSnapshotSourceOptions
): HomeAnimeSnapshotSource {
  const { ttlMs, now, load } = options;

  if (!Number.isFinite(ttlMs) || !Number.isInteger(ttlMs) || ttlMs < 0) {
    throw new RangeError(
      "ttlMs must be a non-negative finite integer"
    );
  }

  let cachedItems: readonly AnimeItem[] | null = null;
  let fetchedAt: number | null = null;
  let inFlight: Promise<HomeAnimeSnapshot> | null = null;

  function isFresh(currentNow: number): boolean {
    return (
      cachedItems !== null &&
      fetchedAt !== null &&
      currentNow < fetchedAt + ttlMs
    );
  }

  async function refresh(): Promise<HomeAnimeSnapshot> {
    let loaded: readonly AnimeItem[];
    try {
      loaded = await load();
    } catch {
      if (cachedItems !== null) {
        return { freshness: "stale", items: cachedItems };
      }
      return { freshness: "unavailable", items: null };
    }

    const items = loaded.slice();
    const nextFetchedAt = now();
    cachedItems = items;
    fetchedAt = nextFetchedAt;
    return { freshness: "fresh", items };
  }

  async function getSnapshot(): Promise<HomeAnimeSnapshot> {
    if (isFresh(now())) {
      return { freshness: "fresh", items: cachedItems as readonly AnimeItem[] };
    }

    if (inFlight !== null) {
      return inFlight;
    }

    const pending = refresh().finally(() => {
      if (inFlight === pending) {
        inFlight = null;
      }
    });
    inFlight = pending;
    return pending;
  }

  return { getSnapshot };
}
