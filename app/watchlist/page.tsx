import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import type { Metadata } from "next";
import { WatchlistClient } from "./watchlist-client";

export const metadata: Metadata = {
  title: "視聴管理リスト — numanie"
};

export default async function WatchlistPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  const items = await listStatuses(userId);

  return <WatchlistClient initialItems={items} />;
}
