import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getViewerReactions, getWatchlistShare } from "@/lib/shares";
import { WatchlistShareClient } from "./watchlist-share-client";

export default async function WatchlistSharePage({
  params
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const share = await getWatchlistShare(shareId);

  if (!share) {
    notFound();
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const viewerReactions = userId ? await getViewerReactions(shareId, userId) : [];

  return (
    <WatchlistShareClient
      initialShare={share}
      initialViewerReactions={viewerReactions}
    />
  );
}
