import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { getTierLabelsByAnimeId } from "@/lib/boards";

export const GET = withApiRoute("boards.tiers.GET", async (request: Request) => {
  const userId = await requireUserId();
  return NextResponse.json({ tiers: await getTierLabelsByAnimeId(userId) });
});
