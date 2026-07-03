import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import type { Metadata } from "next";
import { WatchlistClientV2Grok } from "./watchlist-client-v2-grok";

export const metadata: Metadata = {
  title: "視聴管理リスト — numanie"
};

export default async function WatchlistPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/?login=required");
  }

  const items = await listStatuses(userId);

  const watchlistAnime = items.map((record) => record.anime).filter((anime): anime is AnimeItem => Boolean(anime));
  const { map: providerMap } = await buildProviderMapWithStats(watchlistAnime, { skipUncached: true });
  const enrichedItems = items.map((record) =>
    record.anime
      ? { ...record, anime: enrichWithStreamingProviders([record.anime], providerMap)[0] }
      : record
  );

  return <WatchlistClientV2Grok initialItems={enrichedItems} />;
}
