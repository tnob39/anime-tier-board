import { NextResponse } from "next/server";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const GET = withApiRoute("image-proxy.GET", async (request: Request) => {
  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get("url");

  if (!rawUrl) {
    throw new AppError({
      message: "url パラメータが必要です。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  let imageUrl: URL;

  try {
    imageUrl = new URL(rawUrl);
  } catch {
    throw new AppError({
      message: "URLの形式が正しくありません。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  if (imageUrl.protocol !== "https:") {
    throw new AppError({
      message: "https の画像 URL のみ対応しています。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  if (isBlockedHost(imageUrl.hostname)) {
    throw new AppError({
      message: "このホストからの画像取得は許可されていません。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  let response: Response;
  try {
    response = await fetch(imageUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "anime-tier-board/0.1",
      },
      cache: "force-cache",
    });
  } catch {
    throw new AppError({
      message: "画像の取得に失敗しました。",
      status: 502,
      code: "UPSTREAM",
      expose: true,
    });
  }

  if (!response.ok) {
    throw new AppError({
      message: `画像の取得に失敗しました（${response.status}）。`,
      status: 502,
      code: "UPSTREAM",
      expose: true,
    });
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  if (!contentType.startsWith("image/")) {
    throw new AppError({
      message: "指定 URL は画像ではありませんでした。",
      status: 415,
      code: "VALIDATION",
      expose: true,
    });
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);

  if (contentLength > MAX_IMAGE_BYTES) {
    throw new AppError({
      message: "画像が大きすぎます。",
      status: 413,
      code: "VALIDATION",
      expose: true,
    });
  }

  const imageBuffer = await response.arrayBuffer();

  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError({
      message: "画像が大きすぎます。",
      status: 413,
      code: "VALIDATION",
      expose: true,
    });
  }

  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
});

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower.endsWith(".local")
  ) {
    return true;
  }

  if (/^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower)) {
    return true;
  }

  const match = lower.match(/^172\.(\d+)\./);

  if (match) {
    const octet = Number(match[1]);
    return octet >= 16 && octet <= 31;
  }

  return false;
}