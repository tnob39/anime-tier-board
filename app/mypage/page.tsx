import type { Metadata } from "next";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import { calcSubscriptionStats } from "@/lib/subscription-stats";
import { getSubscriptionState } from "@/lib/subscriptions";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import { MyPageClient } from "./mypage-client";

export const metadata: Metadata = {
  title: "マイページ | numanie"
};

export default async function MyPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  let statusCounts = null;
  let subscriptionSummary = null;

  if (userId) {
    const [items, subscriptionState] = await Promise.all([
      listStatuses(userId),
      getSubscriptionState(userId)
    ]);
    statusCounts = {
      planned: items.filter((item) => item.status === "planned").length,
      watching: items.filter((item) => item.status === "watching").length,
      completed: items.filter((item) => item.status === "completed").length,
      paused: items.filter((item) => item.status === "paused").length,
      dropped: items.filter((item) => item.status === "dropped").length,
    };

    if (subscriptionState.subscriptions.length > 0) {
      const watchlist = items
        .map((record) => record.anime)
        .filter((anime): anime is AnimeItem => Boolean(anime));
      const { map: providerMap } = await buildProviderMapWithStats(watchlist, {
        skipUncached: true
      });
      const enrichedWatchlist = enrichWithStreamingProviders(watchlist, providerMap);
      const stats = calcSubscriptionStats(enrichedWatchlist, subscriptionState.subscriptions);

      subscriptionSummary = {
        serviceCount: subscriptionState.subscriptions.length,
        coveragePercentage: stats.coveragePercentage,
        watchlistCount: stats.watchlistCount,
        coveredCount: stats.coveredCount
      };
    } else {
      subscriptionSummary = {
        serviceCount: 0,
        coveragePercentage: 0,
        watchlistCount: 0,
        coveredCount: 0
      };
    }
  }

  return (
    <MyPageClient
      statusCounts={statusCounts}
      subscriptionSummary={subscriptionSummary}
    />
  );
}
