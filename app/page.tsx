import { auth } from "@/auth";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { listStatuses } from "@/lib/statuses";
import { HomeClient } from "./home-client";
import { HomeGuest } from "./home-guest";

export default async function HomePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return <HomeGuest />;
  }

  const [items, seasonalAnime] = await Promise.all([
    listStatuses(userId),
    fetchCurrentSeasonAnimeForHome().catch(() => []),
  ]);

  return <HomeClient initialItems={items} initialSeasonalAnime={seasonalAnime} />;
}
