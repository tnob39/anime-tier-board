"use client";

import { useWatchlistV2 } from "@/lib/watchlist-flag";
import type { AnimeStatusRecord } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";
import { WatchlistClient } from "./watchlist-client";
import { WatchlistClientV2 } from "./watchlist-client-v2";

export function WatchlistSwitch({
  initialItems,
  initialSeasonalAnime = [],
}: {
  initialItems: AnimeStatusRecord[];
  initialSeasonalAnime?: AnimeItem[];
}) {
  const [v2] = useWatchlistV2();

  if (v2) {
    return <WatchlistClientV2 initialItems={initialItems} />;
  }

  return (
    <WatchlistClient
      initialItems={initialItems}
      initialSeasonalAnime={initialSeasonalAnime ?? []}
    />
  );
}
