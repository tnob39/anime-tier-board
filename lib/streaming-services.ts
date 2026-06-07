import type { AnimeItem } from "@/lib/types";

export type StreamingProvider = {
  name: string;
  url: string;
};

export function getServiceUrl(name: string, url: string): string {
  void name;
  return url;
}

export function getStreamingProviders(item: AnimeItem): StreamingProvider[] {
  if (item.streamingPlatforms?.length) {
    return item.streamingPlatforms
      .filter((platform) => platform.url && platform.name)
      .map((platform) => ({
        name: platform.name,
        url: getServiceUrl(platform.name, platform.url)
      }))
      .slice(0, 5);
  }

  const platforms = new Map<string, StreamingProvider>();
  for (const episode of item.streamingEpisodes ?? []) {
    if (!episode.url) {
      continue;
    }

    const name = episode.site?.trim() || getHostLabel(episode.url);
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (!platforms.has(key)) {
      platforms.set(key, {
        name,
        url: getServiceUrl(name, episode.url)
      });
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