import { notFound } from "next/navigation";
import { getShare } from "@/lib/shares";
import { buildProviderMapWithStats, enrichWithStreamingProviders } from "@/lib/streaming-providers";
import { SharePageClient } from "./share-page-client";

export default async function SharePage({
  params
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const share = await getShare(shareId);

  if (!share) {
    notFound();
  }

  const { map: providerMap } = await buildProviderMapWithStats(share.items, { skipUncached: true });
  const enrichedItems = enrichWithStreamingProviders(share.items, providerMap);

  return <SharePageClient initialShare={{ ...share, items: enrichedItems }} />;
}
