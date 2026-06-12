import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "numanie",
    short_name: "numanie",
    description: "アニメ視聴を自分のものに — ティア表・ウォッチリスト・サブスク管理",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ff",
    theme_color: "#6366f1",
    orientation: "portrait",
    icons: [
      {
        src: "/numanie-icon.png",
        sizes: "1092x1092",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/numanie-icon.png",
        sizes: "1092x1092",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
