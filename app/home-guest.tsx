"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { CalendarDays, Table2, Tv } from "lucide-react";
import CardLane, { type LaneCardData } from "@/components/CardLane";
import { fetchSeasonalAnimeClient } from "@/lib/seasonal-anime-client-cache";
import { getCurrentAnimeSeason } from "@/lib/season";
import type { AnimeItem } from "@/lib/types";
import { useSeasonalPrefetch } from "@/lib/use-seasonal-prefetch";

type HomeGuestProps = {
  loginRequired?: boolean;
  loginRedirectTo?: string;
};

export function HomeGuest({
  loginRequired = false,
  loginRedirectTo,
}: HomeGuestProps) {
  const [seasonalAnime, setSeasonalAnime] = useState<AnimeItem[]>([]);
  useSeasonalPrefetch();

  useEffect(() => {
    let cancelled = false;
    const { year, season } = getCurrentAnimeSeason();

    void fetchSeasonalAnimeClient(year, season)
      .then(({ items }) => {
        if (!cancelled) setSeasonalAnime(items);
      })
      .catch(() => {
        if (!cancelled) setSeasonalAnime([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const seasonalLaneItems: LaneCardData[] = seasonalAnime.slice(0, 12).map((item) => {
    const provider = item.streamingProvidersJp?.flatrate?.[0];
    return {
      id: item.id,
      title: item.title,
      coverImage: item.proxiedImageUrl || item.imageUrl,
      providerLogoUrl: provider?.logoUrl ?? null,
      providerName: provider?.name ?? null
    };
  });

  return (
    <main className="app-main home-guest">
      <div className="home-guest-hero">
        <p className="home-guest-symbol" aria-hidden="true">n</p>
        <h1 className="home-guest-title">アニメを、自分のものに。</h1>
        <p className="home-guest-desc">
          見たいアニメをメモして、どこで配信中かすぐわかる
        </p>
        {loginRequired && (
          <p className="home-guest-login-notice">
            このページの利用にはログインが必要です。Googleでログインしてください。
          </p>
        )}
        {seasonalLaneItems.length > 0 ? (
          <div className="home-guest-seasonal">
            <CardLane heading="🔥 今期の注目" items={seasonalLaneItems} />
          </div>
        ) : null}
        <div className="home-guest-actions">
          <button
            type="button"
            className="command-button emphasis-button"
            onClick={() =>
              void (loginRedirectTo
                ? signIn("google", { redirectTo: loginRedirectTo })
                : signIn("google"))
            }
          >
            ログインして始める
          </button>
          <Link href="/tier" className="command-button">
            今すぐTier表を作る
          </Link>
          <Link href="/guide" className="command-button">
            使い方を見る
          </Link>
        </div>
        <ul className="home-guest-feature-list">
          <li className="home-guest-feature-item">
            <Table2 aria-hidden="true" />
            <span>Tier表で、今期アニメを自分好みに整理</span>
          </li>
          <li className="home-guest-feature-item">
            <CalendarDays aria-hidden="true" />
            <span>放送カレンダーで、見逃しを防止</span>
          </li>
          <li className="home-guest-feature-item">
            <Tv aria-hidden="true" />
            <span>配信サービスごとに、視聴作品を管理</span>
          </li>
        </ul>
      </div>
    </main>
  );
}
