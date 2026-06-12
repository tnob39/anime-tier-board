import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import { getSubscriptionState } from "@/lib/subscriptions";
import { calcSubscriptionStats } from "@/lib/subscription-stats";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import { SubscriptionsClient } from "./subscriptions-client";

export default async function SubscriptionsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  const [statuses, subscriptionState] = await Promise.all([
    listStatuses(userId),
    getSubscriptionState(userId)
  ]);

  const watchlist = statuses
    .map((record) => record.anime)
    .filter((anime): anime is AnimeItem => Boolean(anime));

  const { map: providerMap } = await buildProviderMapWithStats(watchlist, { skipUncached: true });
  const enrichedWatchlist = enrichWithStreamingProviders(watchlist, providerMap);

  const stats = calcSubscriptionStats(enrichedWatchlist, subscriptionState.subscriptions);

  return (
    <Suspense>
      <SubscriptionsClient
        stats={stats}
        serviceIds={subscriptionState.subscriptions.map((subscription) => subscription.serviceId)}
      />
    </Suspense>
  );
}