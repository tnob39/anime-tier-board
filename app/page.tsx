import { auth } from "@/auth";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { listStatuses } from "@/lib/statuses";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import { HomeClient } from "./home-client";
import { HomeGuest } from "./home-guest";

type HomePageProps = {
  searchParams: Promise<{ login?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    const { login } = await searchParams;
    return <HomeGuest loginRequired={login === "required"} />;
  }

  const [items, seasonalAnime] = await Promise.all([
    listStatuses(userId),
    fetchCurrentSeasonAnimeForHome().catch(() => []),
  ]);

  const watchlistAnime = items.map((record) => record.anime).filter((anime): anime is AnimeItem => Boolean(anime));
  const { map: providerMap } = await buildProviderMapWithStats(
    [...watchlistAnime, ...seasonalAnime],
    { skipUncached: true }
  );
  const enrichedSeasonal = enrichWithStreamingProviders(seasonalAnime, providerMap);
  const enrichedItems = items.map((record) =>
    record.anime
      ? { ...record, anime: enrichWithStreamingProviders([record.anime], providerMap)[0] }
      : record
  );

  return <HomeClient initialItems={enrichedItems} initialSeasonalAnime={enrichedSeasonal} />;
}
