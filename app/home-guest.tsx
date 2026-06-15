"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSeasonalPrefetch } from "@/lib/use-seasonal-prefetch";

export function HomeGuest() {
  useSeasonalPrefetch();

  return (
    <main className="app-main home-guest">
      <div className="home-guest-hero">
        <p className="home-guest-symbol" aria-hidden="true">n</p>
        <h1 className="home-guest-title">アニメを、自分のものに。</h1>
        <p className="home-guest-desc">
          Tier表で整理して、視聴履歴を積み上げよう
        </p>
        <div className="home-guest-actions">
          <button
            className="command-button emphasis-button"
            onClick={() => void signIn("google")}
          >
            Googleでログイン
          </button>
          <Link href="/explore" className="command-button">
            作品を探す
          </Link>
        </div>
      </div>
    </main>
  );
}
