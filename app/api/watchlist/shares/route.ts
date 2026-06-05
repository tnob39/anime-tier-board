import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createWatchlistShare } from "@/lib/shares";
import { listStatuses } from "@/lib/statuses";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = (await listStatuses(userId)).filter((item) => item.anime);

  if (!items.length) {
    return NextResponse.json({ error: "No watchlist items to share" }, { status: 400 });
  }

  const shareId = await createWatchlistShare(userId, items);

  return NextResponse.json({ shareId });
}
