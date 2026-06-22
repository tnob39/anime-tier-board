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
    shortcuts: [
      {
        name: "今夜見るリスト",
        short_name: "今夜",
        url: "/watchlist",
        description: "放送日が近い視聴中アニメを確認",
      },
      {
        name: "ティア表",
        short_name: "ティア",
        url: "/tier",
        description: "アニメをティア表で評価",
      },
      {
        name: "サブスク診断",
        short_name: "サブスク",
        url: "/dashboard?section=subscriptions",
        description: "配信サービスのコスパを診断",
      },
    ],
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
