import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import { getSubscriptionState } from "@/lib/subscriptions";
import { ExploreClient } from "./explore-client";

export default async function ExplorePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  const [statuses, subscriptionState] = await Promise.all([
    listStatuses(userId),
    getSubscriptionState(userId)
  ]);

  return (
    <ExploreClient
      initialStatuses={statuses}
      initialSubscriptions={subscriptionState.subscriptions}
    />
  );
}
