import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { getCurrentAnimeSeason } from "@/lib/season";
import { TierBoardApp } from "@/components/TierBoardApp";
import type { AnimeItem } from "@/lib/types";

export default async function TierPage() {
  const current = getCurrentAnimeSeason();
  let initialSeasonalAnime: AnimeItem[] = [];
  try {
    initialSeasonalAnime = await fetchCurrentSeasonAnimeForHome();
  } catch {
    // fall back to client fetch on error (consistent with home page pattern)
    initialSeasonalAnime = [];
  }

  return (
    <TierBoardApp
      initialSeasonalAnime={initialSeasonalAnime}
      initialYear={current.year}
      initialSeason={current.season}
    />
  );
}
