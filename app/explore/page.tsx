import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStatuses } from "@/lib/statuses";
import { getSubscriptionState } from "@/lib/subscriptions";
import type { Metadata } from "next";
import { ExploreClient } from "./explore-client";
import { isOwnerEmail } from "@/lib/owner";
import { canonicalizeSeasonSearchParams } from "@/lib/season-url";

export const metadata: Metadata = {
  title: "さがす — numanie"
};

type ExplorePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect("/");
  }

  if (!isOwnerEmail(session?.user?.email)) {
    redirect("/");
  }

  const rawSearch = await searchParams;
  const canonical = canonicalizeSeasonSearchParams(rawSearch, new Date(), { allowYearOnly: true });
  if (canonical.didChange) {
    redirect(canonical.search ? `/explore?${canonical.search}` : "/explore");
  }

  const [statuses, subscriptionState] = await Promise.all([
    listStatuses(userId),
    getSubscriptionState(userId)
  ]);

  return (
    <ExploreClient
      initialStatuses={statuses}
      initialSubscriptions={subscriptionState.subscriptions}
      initialYear={canonical.explicit ? canonical.ref.year : canonical.current.year}
      initialSeason={canonical.ref.season}
      initialYearScope={!canonical.explicit || canonical.yearScope}
    />
  );
}
