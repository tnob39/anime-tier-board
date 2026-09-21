import { NextResponse } from "next/server";
import { requireUserId, requireWriteIdentity } from "@/lib/api/auth-helpers";
import {
  WRITE_BODY_MAX_BYTES,
  admitCookieCapableWrite,
} from "@/lib/api/write-admission";
import { readJsonWithByteLimit } from "@/lib/api/write-request-guard";
import { withApiRoute } from "@/lib/api/with-api-route";
import { isValidServiceId } from "@/lib/streaming-services";
import { getSubscriptionState, replaceSubscriptions } from "@/lib/subscriptions";

type SubscriptionPayload = {
  serviceIds?: string[];
  onboardingComplete?: boolean;
};

export const GET = withApiRoute("subscriptions.GET", async () => {
  const userId = await requireUserId();
  const state = await getSubscriptionState(userId);

  return NextResponse.json({
    serviceIds: state.subscriptions.map((subscription) => subscription.serviceId),
    subscriptions: state.subscriptions,
    onboardingDone: state.onboardingDone
  });
});

export const POST = withApiRoute("subscriptions.POST", async (request: Request) => {
  const identity = await requireWriteIdentity();
  const denied = admitCookieCapableWrite(request, identity, "userWrite");
  if (denied) return denied;
  const userId = identity.userId;

  const parsed = await readJsonWithByteLimit<SubscriptionPayload>(
    request,
    WRITE_BODY_MAX_BYTES.subscription
  );
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

  const serviceIds = Array.isArray(payload.serviceIds)
    ? payload.serviceIds.filter((serviceId): serviceId is string => typeof serviceId === "string")
    : [];

  if (serviceIds.some((serviceId) => !isValidServiceId(serviceId))) {
    return NextResponse.json({ error: "無効なサービスIDが含まれています。" }, { status: 400 });
  }

  await replaceSubscriptions({
    userId,
    serviceIds,
    markOnboardingDone: payload.onboardingComplete === true
  });

  const state = await getSubscriptionState(userId);

  return NextResponse.json({
    ok: true,
    serviceIds: state.subscriptions.map((subscription) => subscription.serviceId),
    onboardingDone: state.onboardingDone
  });
});
