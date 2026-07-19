import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { getHome } from "@/lib/home-api";

export const dynamic = "force-dynamic";

export const GET = withApiRoute("home.GET", async () =>
  NextResponse.json(await getHome(await requireUserId()))
);
