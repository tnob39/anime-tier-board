import type { AnimeItem } from "@/lib/types";

export type StreamingService = {
  id: string;
  name: string;
  monthlyPrice: number;
  logoUrl: string;
  /** TMDb provider IDs (JP region) for this service. Multiple IDs cover variants (ads tier, Amazon Channels, etc.). */
  tmdbProviderIds: number[];
  affiliateUrl: string | null;
  affiliateTag: string | null;
  /** 公式トップページ(日本向け)。アフィリエイトURL未設定時のアウトバウンド遷移先。サーバー側固定値。 */
  homeUrl: string;
};

export const STREAMING_SERVICES: StreamingService[] = [
  {
    id: "netflix",
    name: "Netflix",
    monthlyPrice: 1590,
    logoUrl: "/icons/netflix.svg",
    tmdbProviderIds: [8, 1796],   // Netflix / Netflix Standard with Ads
    affiliateUrl: null,
    affiliateTag: null,
    homeUrl: "https://www.netflix.com/jp/",
  },
  {
    id: "amazon_prime",
    name: "Amazon Prime Video",
    monthlyPrice: 600,
    logoUrl: "/icons/prime.svg",
    tmdbProviderIds: [9, 2100],   // Amazon Prime Video / Amazon Prime Video with Ads
    affiliateUrl: null,
    affiliateTag: null,
    homeUrl: "https://www.amazon.co.jp/primevideo",
  },
  {
    id: "unext",
    name: "U-NEXT",
    monthlyPrice: 2189,
    logoUrl: "/icons/unext.svg",
    tmdbProviderIds: [84],        // U-NEXT (was 97 — wrong)
    affiliateUrl: null,
    affiliateTag: null,
    homeUrl: "https://video.unext.jp/",
  },
  {
    id: "danime",
    name: "d アニメストア",
    monthlyPrice: 440,
    logoUrl: "/icons/danime.svg",
    tmdbProviderIds: [391, 2494], // dアニメ direct + dAnime Amazon Channel
    affiliateUrl: null,
    affiliateTag: null,
    homeUrl: "https://animestore.docomo.ne.jp/animestore/",
  },
  {
    id: "abema",
    name: "ABEMA プレミアム",
    monthlyPrice: 960,
    logoUrl: "/icons/abema.svg",
    tmdbProviderIds: [223],       // ABEMA
    affiliateUrl: null,
    affiliateTag: null,
    homeUrl: "https://abema.tv/",
  },
  {
    id: "hulu_disney",
    name: "Hulu | Disney+",
    monthlyPrice: 1026,
    logoUrl: "/icons/hulu.svg",
    tmdbProviderIds: [15, 337],   // Hulu + Disney Plus (was 258 — wrong)
    affiliateUrl: null,
    affiliateTag: null,
    homeUrl: "https://www.hulu.jp/",
  },
];

const SERVICE_IDS = new Set(STREAMING_SERVICES.map((s) => s.id));

export function isValidServiceId(id: string): boolean {
  return SERVICE_IDS.has(id);
}

export function getServiceUrl(serviceId: string): string | null {
  const service = STREAMING_SERVICES.find((s) => s.id === serviceId);
  if (!service) return null;
  return service.affiliateUrl ?? null;
}

/**
 * アウトバウンド遷移先URLを返す。許可リスト(STREAMING_SERVICES)に存在する
 * serviceId のみ解決し、アフィリエイトURLがあれば優先、無ければ公式トップURLを返す。
 * いずれもサーバー側の固定値なのでオープンリダイレクトにはならない。未知のIDは null。
 */
export function getServiceLandingUrl(serviceId: string): string | null {
  if (!isValidServiceId(serviceId)) return null;
  const service = STREAMING_SERVICES.find((s) => s.id === serviceId);
  if (!service) return null;
  return service.affiliateUrl ?? service.homeUrl;
}

// ---- AniList アイテムから配信URLを取り出すユーティリティ (evangelist-card 向け) ----

export type StreamingProvider = {
  name: string;
  url: string;
};

export function getStreamingProviders(item: AnimeItem): StreamingProvider[] {
  if (item.streamingPlatforms?.length) {
    return item.streamingPlatforms
      .filter((platform) => platform.url && platform.name)
      .map((platform) => ({ name: platform.name, url: platform.url }))
      .slice(0, 5);
  }

  const platforms = new Map<string, StreamingProvider>();
  for (const episode of item.streamingEpisodes ?? []) {
    if (!episode.url) continue;
    const name = episode.site?.trim() || getHostLabel(episode.url);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!platforms.has(key)) {
      platforms.set(key, { name, url: episode.url });
    }
  }

  return Array.from(platforms.values()).slice(0, 5);
}

function getHostLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const [label] = host.split(".");
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
  } catch {
    return null;
  }
}
