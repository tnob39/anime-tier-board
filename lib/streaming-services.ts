import type { AnimeItem } from "@/lib/types";

export const STREAMING_SERVICES = [
  {
    id: "netflix",
    name: "Netflix",
    monthlyPrice: 1590,
    logoUrl: "/icons/netflix.svg",
    tmdbProviderId: 8,
    affiliateUrl: null,
    affiliateTag: null,
  },
  {
    id: "amazon_prime",
    name: "Amazon Prime Video",
    monthlyPrice: 600,
    logoUrl: "/icons/prime.svg",
    tmdbProviderId: 9,
    affiliateUrl: null,
    affiliateTag: null,
  },
  {
    id: "unext",
    name: "U-NEXT",
    monthlyPrice: 2189,
    logoUrl: "/icons/unext.svg",
    tmdbProviderId: 97,
    affiliateUrl: null,
    affiliateTag: null,
  },
  {
    id: "danime",
    name: "d アニメストア",
    monthlyPrice: 440,
    logoUrl: "/icons/danime.svg",
    tmdbProviderId: 391,
    affiliateUrl: null,
    affiliateTag: null,
  },
  {
    id: "abema",
    name: "ABEMA プレミアム",
    monthlyPrice: 960,
    logoUrl: "/icons/abema.svg",
    tmdbProviderId: 223,
    affiliateUrl: null,
    affiliateTag: null,
  },
  {
    id: "hulu_disney",
    name: "Hulu | Disney+",
    monthlyPrice: 1026,
    logoUrl: "/icons/hulu.svg",
    tmdbProviderId: 258,
    affiliateUrl: null,
    affiliateTag: null,
  },
] as const;

export type StreamingService = typeof STREAMING_SERVICES[number];

const SERVICE_IDS = new Set(STREAMING_SERVICES.map(s => s.id));

export function isValidServiceId(id: string): boolean {
  return SERVICE_IDS.has(id as StreamingService["id"]);
}

export function getServiceUrl(serviceId: string): string | null {
  const service = STREAMING_SERVICES.find(s => s.id === serviceId);
  if (!service) return null;
  return service.affiliateUrl ?? null;
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
