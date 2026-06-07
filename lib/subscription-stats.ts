import { STREAMING_SERVICES, type StreamingService } from "@/lib/streaming-services";
import type { AnimeItem } from "@/lib/types";
import type { UserSubscription } from "@/lib/subscriptions";

const PLATFORM_ALIASES: Array<{ pattern: RegExp; serviceId: string }> = [
  { pattern: /netflix/i, serviceId: "netflix" },
  { pattern: /amazon\s*prime|prime\s*video/i, serviceId: "amazon_prime" },
  { pattern: /u-?next|ユーネクスト/i, serviceId: "unext" },
  { pattern: /d\s*アニメ|danime|dアニメストア/i, serviceId: "danime" },
  { pattern: /abema/i, serviceId: "abema" },
  { pattern: /hulu|disney\+?|ディズニー/i, serviceId: "hulu_disney" }
];

export type ServiceCoverage = {
  service: StreamingService;
  count: number;
  percentage: number;
};

export type AdditionalServiceEffect = {
  service: StreamingService;
  additionalCount: number;
};

export type SubscriptionStats = {
  watchlistCount: number;
  coveredCount: number;
  coveragePercentage: number;
  subscribedCoverage: ServiceCoverage[];
  additionalByService: AdditionalServiceEffect[];
};

export function getAnimeTmdbProviderIds(anime: AnimeItem): number[] {
  const providerIds = new Set<number>();

  // TMDb JP provider data embedded in anime_json (most reliable)
  for (const provider of anime.streamingProvidersJp?.flatrate ?? []) {
    providerIds.add(provider.id);
  }

  // AniList streaming data fallback
  for (const platform of anime.streamingPlatforms ?? []) {
    addProviderId(providerIds, platform.name);
  }

  for (const episode of anime.streamingEpisodes ?? []) {
    addProviderId(providerIds, episode.site ?? episode.title ?? "");
  }

  return [...providerIds];
}

export function animeMatchesProvider(anime: AnimeItem, providerId: number): boolean {
  return getAnimeTmdbProviderIds(anime).includes(providerId);
}

export function calcSubscriptionStats(
  watchlist: AnimeItem[],
  userSubscriptions: UserSubscription[]
): SubscriptionStats {
  const subscribedServices = userSubscriptions
    .map((subscription) => STREAMING_SERVICES.find((service) => service.id === subscription.serviceId))
    .filter((service): service is StreamingService => Boolean(service));

  const subscribedProviderIds = subscribedServices.map((service) => service.tmdbProviderId);
  const coveredAnime = watchlist.filter((anime) =>
    subscribedProviderIds.some((providerId) => animeMatchesProvider(anime, providerId))
  );
  const coveredIds = new Set(coveredAnime.map((anime) => anime.id));

  const subscribedCoverage = subscribedServices.map((service) => {
    const count = watchlist.filter((anime) =>
      animeMatchesProvider(anime, service.tmdbProviderId)
    ).length;

    return {
      service,
      count,
      percentage: watchlist.length ? Math.round((count / watchlist.length) * 100) : 0
    };
  });

  const unsubscribed = STREAMING_SERVICES.filter(
    (service) => !userSubscriptions.some((subscription) => subscription.serviceId === service.id)
  );

  const additionalByService = unsubscribed
    .map((service) => ({
      service,
      additionalCount: watchlist.filter(
        (anime) =>
          !coveredIds.has(anime.id) && animeMatchesProvider(anime, service.tmdbProviderId)
      ).length
    }))
    .sort((left, right) => right.additionalCount - left.additionalCount);

  const watchlistCount = watchlist.length;
  const coveredCount = coveredAnime.length;

  return {
    watchlistCount,
    coveredCount,
    coveragePercentage: watchlistCount ? Math.round((coveredCount / watchlistCount) * 100) : 0,
    subscribedCoverage,
    additionalByService
  };
}

function addProviderId(providerIds: Set<number>, rawName: string) {
  const serviceId = matchServiceId(rawName);
  if (!serviceId) {
    return;
  }

  const service = STREAMING_SERVICES.find((entry) => entry.id === serviceId);
  if (service) {
    providerIds.add(service.tmdbProviderId);
  }
}

function matchServiceId(rawName: string): string | null {
  const normalized = rawName.trim();
  if (!normalized) {
    return null;
  }

  for (const alias of PLATFORM_ALIASES) {
    if (alias.pattern.test(normalized)) {
      return alias.serviceId;
    }
  }

  return null;
}