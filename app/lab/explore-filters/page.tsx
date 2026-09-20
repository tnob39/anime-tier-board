import type { Metadata } from "next";
import { ExploreFiltersClient } from "./explore-filters-client.tsx";

export const metadata: Metadata = {
  title: "さがすフィルタ Lab — numanie",
  description: "正規視聴・年代・スタジオ・スタッフ探索の独立検証モック",
  robots: { index: false, follow: false }
};

export default function LabExploreFiltersPage() {
  return <ExploreFiltersClient />;
}
