export type StreamingService = {
  id: string;
  name: string;
  monthlyPrice: number;
  logoUrl: string;
  tmdbProviderId: number;
  baseUrl: string;
  affiliateUrl: string | null;
  affiliateTag: string | null;
};

export const STREAMING_SERVICES: StreamingService[] = [
  {
    id: "netflix",
    name: "Netflix",
    monthlyPrice: 1590,
    logoUrl: "/icons/netflix.svg",
    tmdbProviderId: 8,
    baseUrl: "https://www.netflix.com/jp/",
    affiliateUrl: null,
    affiliateTag: null
  },
  {
    id: "amazon_prime",
    name: "Amazon Prime Video",
    monthlyPrice: 600,
    logoUrl: "/icons/prime.svg",
    tmdbProviderId: 9,
    baseUrl: "https://www.amazon.co.jp/gp/video/storefront",
    affiliateUrl: null,
    affiliateTag: null
  },
  {
    id: "unext",
    name: "U-NEXT",
    monthlyPrice: 2189,
    logoUrl: "/icons/unext.svg",
    tmdbProviderId: 97,
    baseUrl: "https://video.unext.jp/",
    affiliateUrl: null,
    affiliateTag: null
  },
  {
    id: "danime",
    name: "d アニメストア",
    monthlyPrice: 440,
    logoUrl: "/icons/danime.svg",
    tmdbProviderId: 391,
    baseUrl: "https://animestore.docomo.ne.jp/",
    affiliateUrl: null,
    affiliateTag: null
  },
  {
    id: "abema",
    name: "ABEMA プレミアム",
    monthlyPrice: 960,
    logoUrl: "/icons/abema.svg",
    tmdbProviderId: 223,
    baseUrl: "https://abema.tv/about/premium",
    affiliateUrl: null,
    affiliateTag: null
  },
  {
    id: "hulu_disney",
    name: "Hulu | Disney+",
    monthlyPrice: 1026,
    logoUrl: "/icons/hulu.svg",
    tmdbProviderId: 258,
    baseUrl: "https://www.hulu.jp/",
    affiliateUrl: null,
    affiliateTag: null
  }
];

export function getServiceById(serviceId: string): StreamingService | undefined {
  return STREAMING_SERVICES.find((service) => service.id === serviceId);
}

export function getServiceUrl(serviceId: string): string | null {
  const service = getServiceById(serviceId);
  if (!service) {
    return null;
  }

  return service.affiliateUrl ?? service.baseUrl ?? null;
}

export function isValidServiceId(serviceId: string): boolean {
  return STREAMING_SERVICES.some((service) => service.id === serviceId);
}