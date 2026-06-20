import { NextResponse } from "next/server";

import { withApiRoute } from "@/lib/api/with-api-route";
import {
  createNativeSessionToken,
  getUserFromSessionToken,
  revokeSessionFromAuthorizationHeader,
  verifyGoogleIdToken,
} from "@/lib/api/native-auth";
import { AppError } from "@/lib/errors/app-error";

type ExchangePayload = {
  idToken?: string;
  devMode?: boolean;
  email?: string;
  name?: string;
};

function isValidExchangePayload(value: unknown): value is ExchangePayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const optionalString = (key: string) =>
    candidate[key] === undefined || typeof candidate[key] === "string";

  return (
    (candidate.idToken === undefined || typeof candidate.idToken === "string") &&
    (candidate.devMode === undefined || typeof candidate.devMode === "boolean") &&
    optionalString("email") &&
    optionalString("name")
  );
}

export const POST = withApiRoute("auth.native.POST", async (request: Request) => {
  const rawPayload = await request.json();
  if (!isValidExchangePayload(rawPayload)) {
    throw new AppError({
      message: "リクエストの形式が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }
  const payload = rawPayload;

  let user;
  if (payload.devMode) {
    if (process.env.NODE_ENV !== "development") {
      throw new AppError({
        message: "開発モード認証は本番では利用できません。",
        status: 403,
        code: "UNAUTHORIZED",
        expose: true,
      });
    }

    const email = payload.email?.trim() || "native-dev@local.test";
    user = {
      id: `dev-${email}`,
      email,
      name: payload.name?.trim() || "Native Dev User",
    };
  } else if (payload.idToken) {
    try {
      user = await verifyGoogleIdToken(payload.idToken);
    } catch {
      throw new AppError({
        message: "Google 認証トークンが無効です。",
        status: 401,
        code: "UNAUTHORIZED",
        expose: true,
      });
    }
  } else {
    throw new AppError({
      message: "idToken または devMode が必要です。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  const token = await createNativeSessionToken(user);

  return NextResponse.json({
    token,
    user,
  });
});

export const GET = withApiRoute("auth.native.GET", async (request: Request) => {
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  if (!bearerToken) {
    throw new AppError({
      message: "Bearer トークンが必要です。",
      status: 401,
      code: "UNAUTHORIZED",
      expose: true,
    });
  }

  const user = await getUserFromSessionToken(bearerToken);
  if (!user) {
    throw new AppError({
      message: "セッションが無効です。",
      status: 401,
      code: "UNAUTHORIZED",
      expose: true,
    });
  }

  return NextResponse.json({ user });
});

export const DELETE = withApiRoute("auth.native.DELETE", async (request: Request) => {
  await revokeSessionFromAuthorizationHeader(request.headers.get("authorization"));
  return NextResponse.json({ ok: true });
});