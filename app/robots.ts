import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const configuredUrl = process.env.AUTH_URL?.trim();
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const origin = (
    configuredUrl ||
    (vercelUrl ? `https://${vercelUrl}` : "https://anime-tier-board.vercel.app")
  ).replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: `${origin}/sitemap.xml`
  };
}
