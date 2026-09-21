import { NextResponse } from "next/server";
import { requireUserId, requireWriteIdentity } from "@/lib/api/auth-helpers";
import {
  WRITE_BODY_MAX_BYTES,
  admitCookieCapableWrite,
} from "@/lib/api/write-admission";
import { readJsonWithByteLimit } from "@/lib/api/write-request-guard";
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
  const identity = await requireWriteIdentity();
  const denied = admitCookieCapableWrite(request, identity, "userWrite");
  if (denied) return denied;
  const userId = identity.userId;

  const parsed = await readJsonWithByteLimit<SubscribeBody>(
    request,
    WRITE_BODY_MAX_BYTES.push
  );
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

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
  const identity = await requireWriteIdentity();
  const denied = admitCookieCapableWrite(request, identity, "userWrite");
  if (denied) return denied;
  const userId = identity.userId;

  const parsed = await readJsonWithByteLimit<{ endpoint?: string }>(
    request,
    WRITE_BODY_MAX_BYTES.push
  );
  if (!parsed.ok) return parsed.response;
  const { endpoint } = parsed.data;

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
