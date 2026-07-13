import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
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
  const userId = await requireUserId();
  let payload: SubscriptionPayload;

  try {
    payload = (await request.json()) as SubscriptionPayload;
  } catch {
    throw new AppError({
      message: "リクエストの形式が正しくありません。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

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
