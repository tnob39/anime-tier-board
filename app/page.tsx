import { auth } from "@/auth";
import { fetchCurrentSeasonAnimeForHome } from "@/lib/home-seasonal-add";
import { listStatuses } from "@/lib/statuses";
import { HomeClient } from "./home-client";
import { HomeGuest } from "./home-guest";

type HomePageProps = {
  searchParams: Promise<{ login?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    const { login } = await searchParams;
    return <HomeGuest loginRequired={login === "required"} />;
  }

  const [items, seasonalAnime] = await Promise.all([
    listStatuses(userId),
    fetchCurrentSeasonAnimeForHome().catch(() => []),
  ]);

  return <HomeClient initialItems={items} initialSeasonalAnime={seasonalAnime} />;
}
