import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { consumeWriteRateLimit } from "@/lib/api/write-admission";
import { assertSameOriginBrowserWrite } from "@/lib/api/write-request-guard";
import { createDashboardShare } from "@/lib/shares";
import { getDashboard } from "@/lib/statuses";

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const originDenied = assertSameOriginBrowserWrite(request);
  if (originDenied) return originDenied;

  const limited = consumeWriteRateLimit(request, {
    userId,
    policy: "shareCreate",
  });
  if (limited) return limited;

  const dashboard = await getDashboard(userId);

  if (!dashboard.totalStatuses) {
    return NextResponse.json({ error: "共有できる分析データがありません。" }, { status: 400 });
  }

  const shareId = await createDashboardShare(userId, dashboard);

  return NextResponse.json({ shareId });
}
