import { NextRequest, NextResponse } from "next/server";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://anime-tier-board.vercel.app",
  // Capacitor ネイティブシェル (WebView の Origin)。iOS=capacitor://localhost, Android=https://localhost
  "capacitor://localhost",
  "https://localhost",
  // Web/Expo 開発用
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "expo://"
];

const ALLOWED_METHODS = "GET,POST,PUT,DELETE,OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, Accept";

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  return trimmed.endsWith("/") && !trimmed.endsWith("://")
    ? trimmed.slice(0, -1)
    : trimmed;
}

function getConfiguredOrigin(): string | null {
  const authUrl = process.env.AUTH_URL?.trim();
  if (authUrl) {
    return normalizeOrigin(authUrl);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${normalizeOrigin(vercelUrl)}`;
  }

  return null;
}

function getAllowedOrigins(): Set<string> {
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? [];
  const configuredSiteOrigin = getConfiguredOrigin();

  return new Set(
    [
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(configuredSiteOrigin ? [configuredSiteOrigin] : []),
      ...configuredOrigins
    ]
      .map(normalizeOrigin)
      .filter(Boolean)
  );
}

function applyCorsHeaders(response: NextResponse, origin: string): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  response.headers.set("Vary", "Origin");
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");

  if (!origin) {
    return NextResponse.next();
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getAllowedOrigins();
  const isAllowedOrigin = allowedOrigins.has(normalizedOrigin);

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, {
      status: isAllowedOrigin ? 204 : 403
    });

    return isAllowedOrigin
      ? applyCorsHeaders(response, normalizedOrigin)
      : response;
  }

  const response = NextResponse.next();

  return isAllowedOrigin ? applyCorsHeaders(response, normalizedOrigin) : response;
}

export const config = {
  matcher: "/api/:path*"
};
