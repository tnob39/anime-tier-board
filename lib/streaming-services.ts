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

const PROVIDER_NAME_ALIASES: Array<{ pattern: RegExp; serviceId: string }> = [
  { pattern: /netflix/i, serviceId: "netflix" },
  { pattern: /amazon|prime\s*video/i, serviceId: "amazon_prime" },
  { pattern: /u-?next/i, serviceId: "unext" },
  { pattern: /d\s*anime|dアニメ/i, serviceId: "danime" },
  { pattern: /abema/i, serviceId: "abema" },
  { pattern: /hulu|disney/i, serviceId: "hulu_disney" },
];

export function matchServiceIdByProviderName(name: string): string | null {
  return PROVIDER_NAME_ALIASES.find(({ pattern }) => pattern.test(name))?.serviceId ?? null;
}

// ---- AniList アイテムから配信URLを取り出すユーティリティ (evangelist-card 向け) ----

export type StreamingProvider = {
  name: string;
  url: string;
};

/** Tier / Explore カードに並べる見放題プラットフォーム表示用。url が null のときは非クリック表示。 */
export type DisplayStreamingPlatform = {
  name: string;
  url: string | null;
};

/** カード上に直接出す件数。超過分は UI 側で +N 表示する。 */
export const STREAMING_PLATFORM_VISIBLE_LIMIT = 5;

const CANONICAL_DISPLAY_NAMES: Record<string, string> = {
  netflix: "Netflix",
  amazon_prime: "Prime Video",
  unext: "U-NEXT",
  danime: "dアニメストア",
  abema: "ABEMA",
  hulu_disney: "Hulu | Disney+",
};

/**
 * AniList streamingPlatforms と TMDb JP flatrate を常に統合し、
 * 名称正規化・重複排除した見放題リストを返す。
 * どちらも空のときのみ AniList streamingEpisodes にフォールバックする。
 * 件数は切らない（5件超は呼び出し側で +N）。
 */
export function getMergedStreamingPlatforms(
  item: AnimeItem | null | undefined
): DisplayStreamingPlatform[] {
  const merged = new Map<string, DisplayStreamingPlatform>();

  for (const platform of readAniListPlatforms(item)) {
    upsertPlatform(merged, platform.name, platform.url);
  }

  const providerLink = readProviderLink(item);
  for (const provider of readTmdbFlatrate(item)) {
    const serviceId = matchServiceIdByProviderName(provider.name);
    const serviceUrl = serviceId ? getServiceLandingUrl(serviceId) : null;
    // Missing/invalid TMDb links must not become "#". Prefer actionable providerLink,
    // else a known STREAMING_SERVICES landing URL, else keep as non-clickable (null).
    upsertPlatform(merged, provider.name, providerLink ?? serviceUrl);
  }

  if (merged.size > 0) {
    return Array.from(merged.values());
  }

  return readEpisodeFallback(item);
}

export function getStreamingPlatformOverflowCount(
  totalCount: number,
  visibleLimit: number = STREAMING_PLATFORM_VISIBLE_LIMIT
): number {
  if (!Number.isFinite(totalCount) || !Number.isFinite(visibleLimit)) {
    return 0;
  }
  return Math.max(0, Math.floor(totalCount) - Math.max(0, Math.floor(visibleLimit)));
}

export function normalizeStreamingDisplayName(rawName: string): string {
  const trimmed = cleanPlatformLabel(rawName);
  if (!trimmed) {
    return "";
  }

  const serviceId = matchServiceIdByProviderName(trimmed);
  if (serviceId && CANONICAL_DISPLAY_NAMES[serviceId]) {
    return CANONICAL_DISPLAY_NAMES[serviceId];
  }

  return trimmed;
}

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

function upsertPlatform(
  merged: Map<string, DisplayStreamingPlatform>,
  rawName: string,
  rawUrl: string | null | undefined
) {
  const name = normalizeStreamingDisplayName(rawName);
  if (!name) {
    return;
  }

  const url = toActionableHttpUrl(rawUrl);
  const key = platformDedupeKey(name);
  const existing = merged.get(key);
  if (!existing) {
    merged.set(key, { name, url });
    return;
  }

  // Prefer a concrete deep link over a shared TMDb JustWatch-style link; keep existing if candidate has no URL.
  if (url && isPreferablePlatformUrl(url, existing.url)) {
    merged.set(key, { name: existing.name, url });
  }
}

function platformDedupeKey(displayName: string): string {
  const serviceId = matchServiceIdByProviderName(displayName);
  if (serviceId) {
    return `service:${serviceId}`;
  }
  return `name:${displayName.toLowerCase().replace(/\s+/g, " ")}`;
}

function cleanPlatformLabel(value: string): string {
  return value
    .trim()
    .replace(/\s*-\s*Watch\s*$/i, "")
    .replace(/\s+streaming$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Actionable outbound URLs must be absolute http/https only.
 * Rejects javascript:, data:, relative, hash-only, and malformed values.
 */
function toActionableHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function isPreferablePlatformUrl(candidate: string, current: string | null): boolean {
  const candidateScore = platformUrlScore(candidate);
  const currentScore = platformUrlScore(current);
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore;
  }
  return candidate.length > (current?.length ?? 0);
}

function platformUrlScore(url: string | null): number {
  if (!url) {
    return 0;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return 0;
    }
    // TMDb/JustWatch aggregate pages are weaker than service-specific episode links.
    if (/(?:^|\.)themoviedb\.org$/i.test(parsed.hostname) || /(?:^|\.)justwatch\.com$/i.test(parsed.hostname)) {
      return 2;
    }
    return 3;
  } catch {
    return 0;
  }
}

function readAniListPlatforms(
  item: AnimeItem | null | undefined
): Array<{ name: string; url: string }> {
  const raw = item?.streamingPlatforms;
  if (!Array.isArray(raw)) {
    return [];
  }

  const platforms: Array<{ name: string; url: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const name = typeof (entry as { name?: unknown }).name === "string" ? (entry as { name: string }).name : "";
    const url = typeof (entry as { url?: unknown }).url === "string" ? (entry as { url: string }).url : "";
    if (!name.trim() || !url.trim()) {
      continue;
    }
    platforms.push({ name, url });
  }
  return platforms;
}

function readTmdbFlatrate(item: AnimeItem | null | undefined): Array<{ name: string }> {
  const jp = item?.streamingProvidersJp;
  if (!jp || typeof jp !== "object") {
    return [];
  }
  const flatrate = (jp as { flatrate?: unknown }).flatrate;
  if (!Array.isArray(flatrate)) {
    return [];
  }

  const providers: Array<{ name: string }> = [];
  for (const entry of flatrate) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const name = typeof (entry as { name?: unknown }).name === "string" ? (entry as { name: string }).name : "";
    if (!name.trim()) {
      continue;
    }
    providers.push({ name });
  }
  return providers;
}

function readProviderLink(item: AnimeItem | null | undefined): string | null {
  const jp = item?.streamingProvidersJp;
  if (!jp || typeof jp !== "object") {
    return null;
  }
  const link = (jp as { providerLink?: unknown }).providerLink;
  if (typeof link !== "string") {
    return null;
  }
  return toActionableHttpUrl(link);
}

function readEpisodeFallback(item: AnimeItem | null | undefined): DisplayStreamingPlatform[] {
  const episodes = item?.streamingEpisodes;
  if (!Array.isArray(episodes)) {
    return [];
  }

  const platforms = new Map<string, DisplayStreamingPlatform>();
  for (const episode of episodes) {
    if (!episode || typeof episode !== "object") {
      continue;
    }
    const url = typeof (episode as { url?: unknown }).url === "string" ? (episode as { url: string }).url.trim() : "";
    if (!url) {
      continue;
    }
    const site =
      typeof (episode as { site?: unknown }).site === "string"
        ? (episode as { site: string }).site
        : "";
    const name = site.trim() || getHostLabel(url);
    if (!name) {
      continue;
    }
    upsertPlatform(platforms, name, url);
  }

  return Array.from(platforms.values());
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
