import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isValidServiceId } from "@/lib/streaming-services";
import { getSubscriptionState, replaceSubscriptions } from "@/lib/subscriptions";

type SubscriptionPayload = {
  serviceIds?: string[];
  onboardingComplete?: boolean;
};

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getSubscriptionState(userId);

  return NextResponse.json({
    serviceIds: state.subscriptions.map((subscription) => subscription.serviceId),
    subscriptions: state.subscriptions,
    onboardingDone: state.onboardingDone
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: SubscriptionPayload;

  try {
    payload = (await request.json()) as SubscriptionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const serviceIds = Array.isArray(payload.serviceIds)
    ? payload.serviceIds.filter((serviceId): serviceId is string => typeof serviceId === "string")
    : [];

  if (serviceIds.some((serviceId) => !isValidServiceId(serviceId))) {
    return NextResponse.json({ error: "Invalid service id" }, { status: 400 });
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
}