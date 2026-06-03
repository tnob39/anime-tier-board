import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDashboard } from "@/lib/statuses";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ dashboard: await getDashboard(userId) });
}
