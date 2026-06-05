import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getDashboardShare, getViewerReactions } from "@/lib/shares";
import { DashboardShareClient } from "./dashboard-share-client";

export default async function DashboardSharePage({
  params
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const share = await getDashboardShare(shareId);

  if (!share) {
    notFound();
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const viewerReactions = userId ? await getViewerReactions(shareId, userId) : [];

  return (
    <DashboardShareClient
      initialShare={share}
      initialViewerReactions={viewerReactions}
    />
  );
}
