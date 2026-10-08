import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import { getSubscriptionState } from "@/lib/subscriptions";
import { calcSubscriptionStats, toPublicSubscriptionDiagnosis } from "@/lib/subscription-stats";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import { SubscriptionsClient } from "./subscriptions-client";

export const metadata: Metadata = {
  title: "サブスク診断 — numanie",
  description: "マイリストの配信先確認済み作品を、加入中の見放題サービスでどれだけ見られるか確認します。"
};

export default async function SubscriptionsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/?login=required&returnTo=%2Fsubscriptions");
  }

  const [subscriptionState, statuses] = await Promise.all([
    getSubscriptionState(userId),
    listStatuses(userId)
  ]);
  const watchlist = statuses
    .map((record) => record.anime)
    .filter((anime): anime is AnimeItem => Boolean(anime));
  const { map: providerMap } = await buildProviderMapWithStats(watchlist, { skipUncached: true });
  const enrichedWatchlist = enrichWithStreamingProviders(watchlist, providerMap);
  const diagnosis = toPublicSubscriptionDiagnosis(
    calcSubscriptionStats(enrichedWatchlist, subscriptionState.subscriptions)
  );

  return (
    <SubscriptionsClient
      diagnosis={diagnosis}
      initialSubscriptionServiceIds={subscriptionState.subscriptions.map((item) => item.serviceId)}
    />
  );
}
