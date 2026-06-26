"use client";

import type { AnimeStatusRecord } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";
import { useWatchlistV2 } from "@/lib/watchlist-flag";
import { WatchlistClient } from "./watchlist-client";
import { WatchlistClientV2 } from "./watchlist-client-v2";

export function WatchlistSwitch({
  initialItems,
  initialSeasonalAnime
}: {
  initialItems: AnimeStatusRecord[];
  initialSeasonalAnime: AnimeItem[];
}) {
  const [useV2] = useWatchlistV2();

  if (useV2) {
    return <WatchlistClientV2 initialItems={initialItems} />;
  }

  return (
    <WatchlistClient
      initialItems={initialItems}
      initialSeasonalAnime={initialSeasonalAnime}
    />
  );
}
