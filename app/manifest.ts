import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "アニメ Tier ボード",
    short_name: "Tier Board",
    description: "今期アニメの Tier 表と視聴管理",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1117",
    theme_color: "#0f766e",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
