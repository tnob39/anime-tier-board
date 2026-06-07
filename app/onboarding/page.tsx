import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSubscriptionState } from "@/lib/subscriptions";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  const state = await getSubscriptionState(userId);

  if (state.onboardingDone) {
    redirect("/dashboard");
  }

  return (
    <OnboardingClient
      initialServiceIds={state.subscriptions.map((subscription) => subscription.serviceId)}
    />
  );
}