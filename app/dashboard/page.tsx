import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDashboard, listStatuses } from "@/lib/statuses";
import { getSubscriptionState } from "@/lib/subscriptions";
import { calcSubscriptionStats, toPublicSubscriptionDiagnosis } from "@/lib/subscription-stats";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";
import { isOwnerEmail } from "@/lib/owner";
import { DashboardClient } from "./dashboard-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分析 — numanie"
};

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/?login=required&returnTo=/dashboard");
  }

  const isOwner = isOwnerEmail(session?.user?.email);

  const [dashboard, subscriptionState, statuses] = await Promise.all([
    getDashboard(userId),
    getSubscriptionState(userId),
    listStatuses(userId)
  ]);

  const watchlist = statuses
    .map((record) => record.anime)
    .filter((anime): anime is AnimeItem => Boolean(anime));

  const { map: providerMap } = await buildProviderMapWithStats(watchlist, { skipUncached: true });
  const enrichedWatchlist = enrichWithStreamingProviders(watchlist, providerMap);

  const subscriptionStats = calcSubscriptionStats(enrichedWatchlist, subscriptionState.subscriptions);
  const subscriptionDiagnosis = toPublicSubscriptionDiagnosis(subscriptionStats);

  return (
    <DashboardClient
      dashboard={dashboard}
      subscriptionDiagnosis={subscriptionDiagnosis}
      hasSubscriptions={subscriptionState.subscriptions.length > 0}
      initialSubscriptionServiceIds={subscriptionState.subscriptions.map(
        (subscription) => subscription.serviceId
      )}
      isOwner={isOwner}
    />
  );
}
