import { NextResponse } from "next/server";

import { withApiRoute } from "@/lib/api/with-api-route";
import {
  createNativeSessionToken,
  getUserFromSessionToken,
  verifyGoogleIdToken,
} from "@/lib/api/native-auth";
import { AppError } from "@/lib/errors/app-error";

type ExchangePayload = {
  idToken?: string;
  devMode?: boolean;
  email?: string;
  name?: string;
};

export const POST = withApiRoute("auth.native.POST", async (request: Request) => {
  const payload = (await request.json()) as ExchangePayload;

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