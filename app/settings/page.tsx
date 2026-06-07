import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSubscriptionState } from "@/lib/subscriptions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  const state = await getSubscriptionState(userId);

  return (
    <SettingsClient
      initialServiceIds={state.subscriptions.map((subscription) => subscription.serviceId)}
    />
  );
}