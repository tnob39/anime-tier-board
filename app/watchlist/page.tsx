import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { getCurrentAnimeSeason } from "@/lib/season";
import { canonicalizeSeasonSearchParams } from "@/lib/season-url";
import { listStatuses } from "@/lib/statuses";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import type { Metadata } from "next";
import { WatchlistClientV2Grok } from "./watchlist-client-v2-grok";

export const metadata: Metadata = {
  title: "マイリスト — numanie"
};

type WatchlistPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WatchlistPage({ searchParams }: WatchlistPageProps) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const rawSearch = await searchParams;
  const canonical = canonicalizeSeasonSearchParams(rawSearch);
  if (canonical.didChange) {
    redirect(canonical.search ? `/watchlist?${canonical.search}` : "/watchlist");
  }

  if (!userId) {
    const returnTo = canonical.search
      ? encodeURIComponent(`/watchlist?${canonical.search}`)
      : "%2Fwatchlist";
    redirect(`/?login=required&returnTo=${returnTo}`);
  }

  const items = await listStatuses(userId);

  const watchlistAnime = items.map((record) => record.anime).filter((anime): anime is AnimeItem => Boolean(anime));
  const seasonRef = canonical.explicit ? canonical.ref : getCurrentAnimeSeason();

  if (watchlistAnime.length === 0) {
    return (
      <Suspense fallback={null}>
        <WatchlistClientV2Grok initialItems={items} initialSeasonRef={seasonRef} />
      </Suspense>
    );
  }

  const seasonalAnime = await fetchCurrentSeasonAnimeForHome().catch(() => []);
  const watchlistIds = new Set(items.map((record) => record.animeId));
  const genreFrequency = new Map<string, number>();
  for (const record of items) {
    for (const genre of record.anime?.genres ?? []) {
      genreFrequency.set(genre, (genreFrequency.get(genre) ?? 0) + 1);
    }
  }

  const scoredCandidates = seasonalAnime
    .filter((anime) => !watchlistIds.has(anime.id))
    .map((anime, index) => ({
      anime,
      index,
      score: (anime.genres ?? []).reduce(
        (sum, genre) => sum + (genreFrequency.get(genre) ?? 0),
        0
      ),
    }));
  const recommendedByGenre = scoredCandidates.some(({ score }) => score > 0);
  if (recommendedByGenre) {
    scoredCandidates.sort((a, b) => b.score - a.score || a.index - b.index);
  }
  const recommended = scoredCandidates.slice(0, 12).map(({ anime }) => anime);

  const { map: providerMap } = await buildProviderMapWithStats(
    [...watchlistAnime, ...recommended],
    { skipUncached: true }
  );
  const enrichedItems = items.map((record) =>
    record.anime
      ? { ...record, anime: enrichWithStreamingProviders([record.anime], providerMap)[0] }
      : record
  );
  const enrichedRecommended = enrichWithStreamingProviders(recommended, providerMap);

  return (
    <Suspense fallback={null}>
      <WatchlistClientV2Grok
        initialItems={enrichedItems}
        recommendedAnime={enrichedRecommended}
        recommendedByGenre={recommendedByGenre}
        initialSeasonRef={seasonRef}
      />
    </Suspense>
  );
}
