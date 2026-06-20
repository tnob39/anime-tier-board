import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { listStatuses } from "@/lib/statuses";
import { getSubscriptionState } from "@/lib/subscriptions";
import { calcSubscriptionStats, toPublicSubscriptionDiagnosis } from "@/lib/subscription-stats";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import type { AnimeItem } from "@/lib/types";

export const GET = withApiRoute("subscriptions.diagnosis.GET", async () => {
  const userId = await requireUserId();

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

  return NextResponse.json({ diagnosis: toPublicSubscriptionDiagnosis(stats) });
});
