import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { normalizeSeason, seasonLabelJa } from "@/lib/season";
import { getSeasonShare } from "@/lib/season-share";
import { listStatuses } from "@/lib/statuses";
import { SeasonShareClient } from "./season-share-client";

export const metadata: Metadata = {
  title: "期まとめ布教 — numanie"
};

export default async function SeasonSharePage({
  params
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const share = await getSeasonShare(shareId);

  if (!share) {
    notFound();
  }

  const items = (await listStatuses(share.userId)).filter(
    (item) =>
      item.anime &&
      normalizeSeason(item.anime.season ?? null) === share.season &&
      item.anime.seasonYear === share.seasonYear &&
      share.statuses.includes(item.status)
  );

  return (
    <SeasonShareClient
      label={seasonLabelJa(share.season, share.seasonYear)}
      comment={share.comment}
      items={items}
    />
  );
}
