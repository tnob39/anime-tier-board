"use client";

import { useCallback, useMemo, useState } from "react";
import HomeAddSection from "@/components/HomeAddSection";
import { selectUnregisteredSeasonalAnime } from "@/lib/home-seasonal-add";
import { useSeasonalPrefetch } from "@/lib/use-seasonal-prefetch";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";
import { useUiMode } from "@/lib/ui-mode";
import { HomePro } from "./home-pro";
import { HomeSimple } from "./home-simple";

type HomeClientProps = {
  initialItems: AnimeStatusRecord[];
  initialSeasonalAnime: AnimeItem[];
};

/**
 * ホームのモード別ディスパッチャ。
 * ステータス変更の楽観更新はここで一元管理し、今期から追加 ↔ 視聴中/見たい の反映を担う。
 */
export function HomeClient({ initialItems, initialSeasonalAnime }: HomeClientProps) {
  const { mode } = useUiMode();
  const [items, setItems] = useState(initialItems);
  useSeasonalPrefetch(initialSeasonalAnime);

  const addSectionItems = useMemo(
    () => selectUnregisteredSeasonalAnime(initialSeasonalAnime, items),
    [initialSeasonalAnime, items]
  );

  const handleQuickStatus = useCallback(
    async (anime: AnimeItem, status: ViewingStatus) => {
      const previousItems = items;
      const optimisticRecord: AnimeStatusRecord = {
        animeId: anime.id,
        status,
        anime,
        favoriteLevel: null,
        watchSlot: null,
        notes: null,
        watchRhythm: null,
        watchedEpisodes: null,
        updatedAt: new Date().toISOString(),
      };

      setItems((current) => [
        optimisticRecord,
        ...current.filter((record) => record.animeId !== anime.id),
      ]);

      try {
        const response = await fetch("/api/statuses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ animeId: anime.id, status, anime }),
        });

        if (!response.ok) {
          throw new Error("ステータスの保存に失敗しました。");
        }
      } catch {
        setItems(previousItems);
      }
    },
    [items]
  );

  const addSection = (
    <HomeAddSection items={addSectionItems} onQuickStatus={handleQuickStatus} />
  );

  if (mode === "pro") {
    return <HomePro initialItems={items} addSection={addSection} />;
  }

  return <HomeSimple initialItems={items} addSection={addSection} />;
}