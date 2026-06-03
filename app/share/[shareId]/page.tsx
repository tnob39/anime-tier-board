import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getShare, getViewerReactions } from "@/lib/shares";
import { SharePageClient } from "./share-page-client";

export default async function SharePage({
  params
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const share = await getShare(shareId);

  if (!share) {
    notFound();
  }

  const viewerReactions = userId ? await getViewerReactions(shareId, userId) : [];

  return (
    <SharePageClient
      initialShare={share}
      initialViewerReactions={viewerReactions}
    />
  );
}
