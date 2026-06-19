import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
import {
  getNativePushTokensByUser,
  removeNativePushToken,
  saveNativePushToken
} from "@/lib/native-push";

type NativePushBody = {
  expoPushToken?: string;
  platform?: string;
};

export const GET = withApiRoute("push.native.GET", async () => {
  const userId = await requireUserId();
  const tokens = await getNativePushTokensByUser(userId);
  return NextResponse.json({ subscribed: tokens.length > 0, count: tokens.length });
});

export const POST = withApiRoute("push.native.POST", async (request: Request) => {
  const userId = await requireUserId();
  const body = (await request.json()) as NativePushBody;

  if (!body.expoPushToken?.startsWith("ExponentPushToken[")) {
    throw new AppError({
      message: "Expo Push Token が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  await saveNativePushToken(userId, body.expoPushToken, body.platform ?? "unknown");
  return NextResponse.json({ ok: true });
});

export const DELETE = withApiRoute("push.native.DELETE", async (request: Request) => {
  const userId = await requireUserId();
  const { expoPushToken } = (await request.json()) as NativePushBody;

  if (!expoPushToken) {
    throw new AppError({
      message: "expoPushToken が必要です。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  await removeNativePushToken(userId, expoPushToken);
  return NextResponse.json({ ok: true });
});