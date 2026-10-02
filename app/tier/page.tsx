import { redirect } from "next/navigation";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { getCurrentAnimeSeason } from "@/lib/season";
import { canonicalizeSeasonSearchParams } from "@/lib/season-url";
import { TierBoardApp } from "@/components/TierBoardApp";
import type { AnimeItem } from "@/lib/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tier — numanie"
};

type TierPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TierPage({ searchParams }: TierPageProps) {
  const raw = await searchParams;
  const canonical = canonicalizeSeasonSearchParams(raw);
  if (canonical.didChange) {
    redirect(canonical.search ? `/tier?${canonical.search}` : "/tier");
  }

  const current = getCurrentAnimeSeason();
  const initialYear = canonical.explicit ? canonical.ref.year : current.year;
  const initialSeason = canonical.explicit ? canonical.ref.season : current.season;
  let initialSeasonalAnime: AnimeItem[] = [];
  try {
    if (initialYear === current.year && initialSeason === current.season) {
      initialSeasonalAnime = await fetchCurrentSeasonAnimeForHome();
    }
  } catch {
    // fall back to client fetch on error (consistent with home page pattern)
    initialSeasonalAnime = [];
  }

  return (
    <TierBoardApp
      initialSeasonalAnime={initialSeasonalAnime}
      initialYear={initialYear}
      initialSeason={initialSeason}
    />
  );
}
