"use client";

import { useEffect } from "react";
import {
  prefetchCurrentSeasonAnime,
  seedSeasonalAnimeCache,
} from "@/lib/seasonal-anime-client-cache";
import { getCurrentAnimeSeason } from "@/lib/season";
import type { AnimeItem } from "@/lib/types";

/** ホームマウント時に今期データを先読みし、SSR 済みデータがあればキャッシュへ投入する。 */
export function useSeasonalPrefetch(initialSeasonalAnime?: AnimeItem[]): void {
  useEffect(() => {
    const { year, season } = getCurrentAnimeSeason();

    if (initialSeasonalAnime && initialSeasonalAnime.length > 0) {
      seedSeasonalAnimeCache(year, season, initialSeasonalAnime);
    }

    prefetchCurrentSeasonAnime();
  }, [initialSeasonalAnime]);
}