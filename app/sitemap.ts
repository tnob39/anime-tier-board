import type { MetadataRoute } from "next";
import { getCurrentAnimeSeason, getNextAnimeSeason } from "@/lib/season";

const DEFAULT_ORIGIN = "https://anime-tier-board.vercel.app";

function getSiteOrigin(): string {
  const configuredUrl = process.env.AUTH_URL?.trim();
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const origin = configuredUrl || (vercelUrl ? `https://${vercelUrl}` : DEFAULT_ORIGIN);

  return origin.replace(/\/$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  const current = getCurrentAnimeSeason();
  const next = getNextAnimeSeason();
  const lastModified = new Date();

  return [
    {
      url: origin,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...[current, next].map(({ year, season }) => ({
      url: `${origin}/seasons/${year}/${season.toLowerCase()}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
