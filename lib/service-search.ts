const SERVICE_SEARCH_URLS: Record<string, (title: string) => string> = {
  unext: (t) => `https://video.unext.jp/search?searchQuery=${encodeURIComponent(t)}`,
  danime: (t) => `https://animestore.docomo.ne.jp/animestore/SE/SE001/?keyword=${encodeURIComponent(t)}`,
  amazon_prime: (t) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(t)}&i=instant-video`,
  netflix: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  hulu_disney: (t) => `https://www.hulu.jp/search?q=${encodeURIComponent(t)}`,
  abema: (t) => `https://abema.tv/search?q=${encodeURIComponent(t)}`,
};

// TMDb provider ID → service ID のマッピング
const PROVIDER_ID_TO_SERVICE: Record<number, string> = {
  84: "unext",
  391: "danime",
  2494: "danime",
  9: "amazon_prime",
  2100: "amazon_prime",
  8: "netflix",
  1796: "netflix",
  15: "hulu_disney",
  337: "hulu_disney",
  223: "abema",
};

export function serviceSearchUrl(serviceId: string, title: string): string | null {
  return SERVICE_SEARCH_URLS[serviceId]?.(title) ?? null;
}

export function serviceIdFromProviderId(providerId: number): string | null {
  return PROVIDER_ID_TO_SERVICE[providerId] ?? null;
}

export function searchUrlFromProviderId(providerId: number, title: string): string | null {
  const serviceId = serviceIdFromProviderId(providerId);
  if (!serviceId) return null;
  return serviceSearchUrl(serviceId, title);
}
