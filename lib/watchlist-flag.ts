"use client";

import { useEffect, useState } from "react";

export const WATCHLIST_V2_KEY = "numanie:watchlist-v2";

export function readWatchlistV2(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WATCHLIST_V2_KEY) === "1";
}

export function writeWatchlistV2(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WATCHLIST_V2_KEY, on ? "1" : "0");
}

export function useWatchlistV2(): readonly [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false); // SSR/初回は false（V1）でハイドレーション一致
  useEffect(() => {
    setOn(readWatchlistV2());
  }, []);
  return [
    on,
    (v: boolean) => {
      writeWatchlistV2(v);
      setOn(v);
    },
  ] as const;
}
