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
  coveredAnime: AnimeItem[];
};

export type AdditionalServiceEffect = {
  service: StreamingService;
  additionalCount: number;
  additionalAnime: AnimeItem[];
};

export type ExclusiveServiceCoverage = {
  service: StreamingService;
  exclusiveAnime: AnimeItem[];
};

export type SubscriptionStats = {
  watchlistCount: number;
  coveredCount: number;
  coveragePercentage: number;
  subscribedCoverage: ServiceCoverage[];
  exclusiveByService: ExclusiveServiceCoverage[];
  additionalByService: AdditionalServiceEffect[];
  uncoveredAnime: AnimeItem[];
};

export type PublicServiceCoverage = {
  serviceId: string;
  serviceName: string;
  monthlyPrice: number;
  logoUrl: string;
  count: number;
  percentage: number;
  coveredAnime: AnimeItem[];
};

export type PublicAdditionalServiceEffect = {
  serviceId: string;
  serviceName: string;
  monthlyPrice: number;
  logoUrl: string;
  outboundUrl: string | null;
  additionalCount: number;
  additionalAnime: AnimeItem[];
};

export type PublicExclusiveServiceCoverage = {
  serviceId: string;
  serviceName: string;
  logoUrl: string;
  exclusiveAnime: AnimeItem[];
};

export type PublicSubscriptionDiagnosis = {
  watchlistCount: number;
  coveredCount: number;
  coveragePercentage: number;
  recommendedServiceId: string | null;
  outboundUrl: string | null;
  subscribedCoverage: PublicServiceCoverage[];
  exclusiveByService: PublicExclusiveServiceCoverage[];
  additionalByService: PublicAdditionalServiceEffect[];
  uncoveredAnime: AnimeItem[];
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

/**
 * TMDb JP flatrateデータのみで判定する厳格マッチャー。
 * AniList streamingPlatforms/Episodes 由来のフォールバック一致は信頼度が低いため、
 * 独占（このサービスでしか見られない）判定には含めない。
 */
function animeMatchesProviderStrict(anime: AnimeItem, providerId: number): boolean {
  return (anime.streamingProvidersJp?.flatrate ?? []).some((provider) => provider.id === providerId);
}

export function calcSubscriptionStats(
  watchlist: AnimeItem[],
  userSubscriptions: UserSubscription[]
): SubscriptionStats {
  const subscribedServices = userSubscriptions
    .map((subscription) => STREAMING_SERVICES.find((service) => service.id === subscription.serviceId))
    .filter((service): service is StreamingService => Boolean(service));

  const subscribedProviderIds = subscribedServices.flatMap((service) => service.tmdbProviderIds);
  const coveredAnime = watchlist.filter((anime) =>
    subscribedProviderIds.some((providerId) => animeMatchesProvider(anime, providerId))
  );
  const coveredIds = new Set(coveredAnime.map((anime) => anime.id));

  const subscribedCoverage = subscribedServices.map((service) => {
    const covered = watchlist.filter((anime) =>
      service.tmdbProviderIds.some((id) => animeMatchesProvider(anime, id))
    );

    return {
      service,
      count: covered.length,
      percentage: watchlist.length ? Math.round((covered.length / watchlist.length) * 100) : 0,
      coveredAnime: covered
    };
  });

  // 独占判定: 加入中サービスの中でTMDb flatrateデータ上ちょうど1サービスのみ一致する作品を
  // そのサービスの「ここだけ視聴可」とする。AniListフォールバック一致のみの作品は対象外。
  const exclusiveByService: ExclusiveServiceCoverage[] = subscribedServices.map((service) => {
    const exclusiveAnime = watchlist.filter((anime) => {
      const strictMatchCount = subscribedServices.filter((candidate) =>
        candidate.tmdbProviderIds.some((id) => animeMatchesProviderStrict(anime, id))
      ).length;
      const matchesThisService = service.tmdbProviderIds.some((id) =>
        animeMatchesProviderStrict(anime, id)
      );
      return strictMatchCount === 1 && matchesThisService;
    });

    return { service, exclusiveAnime };
  });

  const unsubscribed = STREAMING_SERVICES.filter(
    (service) => !userSubscriptions.some((subscription) => subscription.serviceId === service.id)
  );

  const additionalByService = unsubscribed
    .map((service) => {
      const additional = watchlist.filter(
        (anime) =>
          !coveredIds.has(anime.id) &&
          service.tmdbProviderIds.some((id) => animeMatchesProvider(anime, id))
      );
      return {
        service,
        additionalCount: additional.length,
        additionalAnime: additional
      };
    })
    .sort((left, right) => right.additionalCount - left.additionalCount);

  const watchlistCount = watchlist.length;
  const coveredCount = coveredAnime.length;

  const uncoveredAnime = watchlist.filter((anime) => !coveredIds.has(anime.id));

  return {
    watchlistCount,
    coveredCount,
    coveragePercentage: watchlistCount ? Math.round((coveredCount / watchlistCount) * 100) : 0,
    subscribedCoverage,
    exclusiveByService,
    additionalByService,
    uncoveredAnime
  };
}

export function toPublicSubscriptionDiagnosis(stats: SubscriptionStats): PublicSubscriptionDiagnosis {
  const recommended = stats.additionalByService.find((entry) => entry.additionalCount > 0) ?? null;

  return {
    watchlistCount: stats.watchlistCount,
    coveredCount: stats.coveredCount,
    coveragePercentage: stats.coveragePercentage,
    recommendedServiceId: recommended?.service.id ?? null,
    outboundUrl: recommended?.service.affiliateUrl ?? null,
    subscribedCoverage: stats.subscribedCoverage.map((entry) => ({
      ...toPublicStreamingServiceFields(entry.service),
      count: entry.count,
      percentage: entry.percentage,
      coveredAnime: entry.coveredAnime
    })),
    exclusiveByService: stats.exclusiveByService
      .filter((entry) => entry.exclusiveAnime.length > 0)
      .map((entry) => ({
        serviceId: entry.service.id,
        serviceName: entry.service.name,
        logoUrl: entry.service.logoUrl,
        exclusiveAnime: entry.exclusiveAnime
      })),
    additionalByService: stats.additionalByService.map((entry) => ({
      ...toPublicStreamingServiceFields(entry.service),
      outboundUrl: entry.service.affiliateUrl,
      additionalCount: entry.additionalCount,
      additionalAnime: entry.additionalAnime
    })),
    uncoveredAnime: stats.uncoveredAnime
  };
}

function toPublicStreamingServiceFields(service: StreamingService) {
  return {
    serviceId: service.id,
    serviceName: service.name,
    monthlyPrice: service.monthlyPrice,
    logoUrl: service.logoUrl
  };
}

function addProviderId(providerIds: Set<number>, rawName: string) {
  const serviceId = matchServiceId(rawName);
  if (!serviceId) {
    return;
  }

  const service = STREAMING_SERVICES.find((entry) => entry.id === serviceId);
  if (service) {
    for (const id of service.tmdbProviderIds) {
      providerIds.add(id);
    }
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
