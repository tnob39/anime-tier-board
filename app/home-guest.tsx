"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { CalendarDays, Table2, Tv } from "lucide-react";
import { useSeasonalPrefetch } from "@/lib/use-seasonal-prefetch";

type HomeGuestProps = {
  loginRequired?: boolean;
};

export function HomeGuest({ loginRequired = false }: HomeGuestProps) {
  useSeasonalPrefetch();

  return (
    <main className="app-main home-guest">
      <div className="home-guest-hero">
        <p className="home-guest-symbol" aria-hidden="true">n</p>
        <h1 className="home-guest-title">アニメを、自分のものに。</h1>
        <p className="home-guest-desc">
          Tier表で整理して、視聴履歴を積み上げよう
        </p>
        {loginRequired && (
          <p className="home-guest-login-notice">
            このページの利用にはログインが必要です。Googleでログインしてください。
          </p>
        )}
        <div className="home-guest-actions">
          <button
            type="button"
            className="command-button emphasis-button"
            onClick={() => void signIn("google")}
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
