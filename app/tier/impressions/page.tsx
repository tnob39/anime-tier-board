import type { Metadata } from "next";
import { getCurrentAnimeSeason } from "@/lib/season";
import { isImpressionSeason } from "@/lib/season-impressions-model";
import { ImpressionsClient } from "./impressions-client";
import "./impressions.css";

export const metadata: Metadata = { title: "今期チェック — numanie", robots: { index: false, follow: false } };

export default async function ImpressionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const candidate = { year: Number(query.year), season: query.season };
  const season = isImpressionSeason(candidate) ? candidate : getCurrentAnimeSeason();
  return <ImpressionsClient key={`${season.year}:${season.season}`} seasonKey={season} resumeToken={typeof query.resume === "string" ? query.resume : null} />;
}
