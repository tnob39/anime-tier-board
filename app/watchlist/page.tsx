import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import type { Metadata } from "next";
import { WatchlistClientV2Grok } from "./watchlist-client-v2-grok";

export const metadata: Metadata = {
  title: "視聴管理リスト — numanie"
};

export default async function WatchlistPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/?login=required");
  }

  const items = await listStatuses(userId);

  return <WatchlistClientV2Grok initialItems={items} />;
}
