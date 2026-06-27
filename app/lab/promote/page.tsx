import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCurrentAnimeSeason, normalizeSeason, seasonLabelJa } from "@/lib/season";
import { listStatuses } from "@/lib/statuses";
import type { AnimeSeason } from "@/lib/types";
import { PromoteClient, type SeasonOption } from "./promote-client";

export const metadata: Metadata = {
  title: "期まとめ布教 — numanie",
  robots: { index: false }
};

export default async function PromotePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect("/");
  }

  const seasons = new Map<string, { season: AnimeSeason; year: number }>();
  for (const item of await listStatuses(userId)) {
    const season = normalizeSeason(item.anime?.season ?? null);
    const year = item.anime?.seasonYear;
    if (season && typeof year === "number") {
      seasons.set(`${year}-${season}`, { season, year });
    }
  }

  const current = getCurrentAnimeSeason();
  const currentKey = `${current.year}-${current.season}`;
  if (!seasons.has(currentKey)) {
    seasons.set(currentKey, current);
  }

  const options: SeasonOption[] = Array.from(seasons.values())
    .sort((a, b) => b.year - a.year || seasonOrder(b.season) - seasonOrder(a.season))
    .map(({ season, year }) => ({
      season,
      year,
      label: seasonLabelJa(season, year)
    }));

  return <PromoteClient options={options} defaultKey={currentKey} />;
}

function seasonOrder(season: AnimeSeason): number {
  return ["WINTER", "SPRING", "SUMMER", "FALL"].indexOf(season);
}
