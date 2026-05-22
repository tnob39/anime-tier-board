import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let imageUrl: URL;

  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (imageUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "only https image URLs are supported" },
      { status: 400 }
    );
  }

  if (isBlockedHost(imageUrl.hostname)) {
    return NextResponse.json({ error: "blocked host" }, { status: 400 });
  }

  const response = await fetch(imageUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "anime-tier-board/0.1"
    },
    cache: "force-cache"
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `image request failed: ${response.status}` },
      { status: 502 }
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  if (!contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: "url did not return an image" },
      { status: 415 }
    );
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);

  if (contentLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "image is too large" }, { status: 413 });
  }

  const imageBuffer = await response.arrayBuffer();

  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "image is too large" }, { status: 413 });
  }

  return new Response(imageBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400"
    }
  });
}

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
