import { auth } from "@/auth";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { listStatuses } from "@/lib/statuses";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import { HomeClient } from "./home-client";
import { HomeGuest } from "./home-guest";

/** Allowlisted protected routes only — exact path match; no query/hash/open redirect. */
const ALLOWED_RETURN_TO = new Set([
  "/dashboard",
  "/watchlist",
  "/settings",
  "/voice-actors",
]);

function getValidatedReturnTo(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  if (!ALLOWED_RETURN_TO.has(raw)) return undefined;
  return raw;
}

type HomePageProps = {
  searchParams: Promise<{ login?: string; returnTo?: string | string[] }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    const { login, returnTo: rawReturnTo } = await searchParams;
    const returnTo = getValidatedReturnTo(rawReturnTo);
    const loginRedirectTo = returnTo ?? (rawReturnTo === undefined ? undefined : "/");
    return (
      <HomeGuest
        loginRequired={login === "required"}
        loginRedirectTo={loginRedirectTo}
      />
    );
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
