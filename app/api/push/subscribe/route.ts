import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
import { saveSubscription, removeSubscription, getSubscriptionsByUser } from "@/lib/push";

type SubscribeBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export const GET = withApiRoute("push.subscribe.GET", async () => {
  const userId = await requireUserId();
  const subs = await getSubscriptionsByUser(userId);
  return NextResponse.json({ subscribed: subs.length > 0, count: subs.length });
});

export const POST = withApiRoute("push.subscribe.POST", async (request: Request) => {
  const userId = await requireUserId();
  const body = (await request.json()) as SubscribeBody;

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    throw new AppError({
      message: "購読情報が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  await saveSubscription(userId, {
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth }
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = withApiRoute("push.subscribe.DELETE", async (request: Request) => {
  const userId = await requireUserId();
  const { endpoint } = (await request.json()) as { endpoint?: string };

  if (!endpoint) {
    throw new AppError({
      message: "endpoint が必要です。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  await removeSubscription(userId, endpoint);
  return NextResponse.json({ ok: true });
});
