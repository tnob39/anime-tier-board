import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { getDashboard } from "@/lib/statuses";

export const GET = withApiRoute("dashboard.GET", async () => {
  const userId = await requireUserId();
  return NextResponse.json({ dashboard: await getDashboard(userId) });
});