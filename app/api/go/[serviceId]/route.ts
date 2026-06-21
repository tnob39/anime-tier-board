import { NextResponse } from "next/server";

import { getServiceLandingUrl } from "@/lib/streaming-services";

/**
 * GET /api/go/[serviceId]
 * サービスの公式/アフィリエイトページへ 302 リダイレクトする安全なアウトバウンド。
 *
 * セキュリティ: リダイレクト先はサーバー側の許可リスト(STREAMING_SERVICES)由来の
 * 固定URLのみ。ユーザー入力のURL(`to=`等)は一切受け取らないため、オープンリダイレクト
 * にはならない。クリック記録などのDB書き込みも行わない。
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ serviceId: string }> }
) {
  const { serviceId } = await context.params;
  const url = getServiceLandingUrl(serviceId);

  if (!url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(url, 302);
}
