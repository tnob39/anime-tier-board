import type { Metadata } from "next";
import { auth } from "@/auth";
import { getTierLabelsByAnimeId } from "@/lib/boards";
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
  let tierDistribution: Array<{ label: string; color: string; count: number }> | null = null;

  if (userId) {
    const [items, subscriptionState, tierLabelsByAnimeId] = await Promise.all([
      listStatuses(userId),
      getSubscriptionState(userId),
      getTierLabelsByAnimeId(userId)
    ]);
    const tierCounts = new Map<string, { label: string; color: string; count: number }>();
    for (const { label, color } of Object.values(tierLabelsByAnimeId)) {
      const existing = tierCounts.get(label);
      if (existing) {
        existing.count += 1;
      } else {
        tierCounts.set(label, { label, color, count: 1 });
      }
    }
    const knownTierOrder = ["S", "A", "B", "C", "D"];
    tierDistribution = Array.from(tierCounts.values()).sort((a, b) => {
      const aRank = knownTierOrder.indexOf(a.label);
      const bRank = knownTierOrder.indexOf(b.label);
      if (aRank !== -1 && bRank !== -1) return aRank - bRank;
      if (aRank !== -1) return -1;
      if (bRank !== -1) return 1;
      return b.count - a.count;
    });
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
      tierDistribution={tierDistribution}
    />
  );
}
