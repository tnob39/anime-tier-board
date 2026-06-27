"use client";

import { useEffect, useState } from "react";

// 視聴管理リストの実装版切替（オーナー実機比較用）。
// "off" = 通常版 / "codex" = Codex版V2 / "grok" = Grok版V2
export type WatchlistMode = "off" | "codex" | "grok";

export const WATCHLIST_MODE_KEY = "numanie:watchlist-v2-mode";

const VALID: readonly WatchlistMode[] = ["off", "codex", "grok"] as const;

export function readWatchlistMode(): WatchlistMode {
  if (typeof window === "undefined") return "off";
  const raw = window.localStorage.getItem(WATCHLIST_MODE_KEY);
  return (VALID as readonly string[]).includes(raw ?? "")
    ? (raw as WatchlistMode)
    : "off";
}

export function writeWatchlistMode(mode: WatchlistMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WATCHLIST_MODE_KEY, mode);
}

export function useWatchlistMode(): readonly [WatchlistMode, (mode: WatchlistMode) => void] {
  const [mode, setMode] = useState<WatchlistMode>("off");

  useEffect(() => {
    setMode(readWatchlistMode());
  }, []);

  return [
    mode,
    (value: WatchlistMode) => {
      writeWatchlistMode(value);
      setMode(value);
    }
  ] as const;
}
