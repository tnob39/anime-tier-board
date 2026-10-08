import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { getCurrentAnimeSeason } from "@/lib/season";
import { canonicalizeSeasonSearchParams } from "@/lib/season-url";
import { listStatuses } from "@/lib/statuses";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import { HomeClient } from "./home-client";
import { HomeGuest } from "./home-guest";

/** Allowlisted protected routes only — exact path match; no query/hash/open redirect. */
const ALLOWED_RETURN_TO = new Set([
  "/dashboard",
  "/subscriptions",
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const rawSearch = await searchParams;
  const canonical = canonicalizeSeasonSearchParams(rawSearch);
  if (canonical.didChange) {
    redirect(canonical.search ? `/?${canonical.search}` : "/");
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const seasonRef = canonical.explicit ? canonical.ref : getCurrentAnimeSeason();

  if (!userId) {
    const login = typeof rawSearch.login === "string" ? rawSearch.login : undefined;
    const rawReturnTo = rawSearch.returnTo;
    const returnTo = getValidatedReturnTo(rawReturnTo);
    const loginRedirectTo = returnTo ?? (rawReturnTo === undefined ? undefined : "/");
    return (
      <Suspense fallback={null}>
        <HomeGuest
          loginRequired={login === "required"}
          loginRedirectTo={loginRedirectTo}
          initialSeasonRef={seasonRef}
        />
      </Suspense>
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

  return (
    <Suspense fallback={null}>
      <HomeClient
        initialItems={enrichedItems}
        initialSeasonalAnime={enrichedSeasonal}
        initialSeasonRef={seasonRef}
      />
    </Suspense>
  );
}
