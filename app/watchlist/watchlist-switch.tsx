"use client";

import type { AnimeStatusRecord } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";
import { useWatchlistMode } from "@/lib/watchlist-flag";
import { WatchlistClient } from "./watchlist-client";
import { WatchlistClientV2Codex } from "./watchlist-client-v2-codex";
import { WatchlistClientV2Grok } from "./watchlist-client-v2-grok";
import "./watchlist-v2-shared.css";

export function WatchlistSwitch({
  initialItems,
  initialSeasonalAnime,
  canPreview
}: {
  initialItems: AnimeStatusRecord[];
  initialSeasonalAnime: AnimeItem[];
  // オーナー（実機比較用）のみ V2 を出せる。false の一般ユーザーは常に通常版。
  canPreview: boolean;
}) {
  const [mode] = useWatchlistMode();

  if (canPreview && mode === "codex") {
    return <WatchlistClientV2Codex initialItems={initialItems} />;
  }

  if (canPreview && mode === "grok") {
    return <WatchlistClientV2Grok initialItems={initialItems} />;
  }

  return (
    <WatchlistClient
      initialItems={initialItems}
      initialSeasonalAnime={initialSeasonalAnime}
    />
  );
}
