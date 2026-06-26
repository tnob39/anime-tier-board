"use client";

import { useWatchlistV2 } from "@/lib/watchlist-flag";

export function WatchlistV2Toggle() {
  const [enabled, setEnabled] = useWatchlistV2();

  return (
    <label className="settings-toggle-row">
      <span>
        <strong>新しいマイリスト（ベータ）</strong>
        <small>ABEMA風の新しい視聴管理画面を試せます。いつでも元に戻せます。</small>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => setEnabled(event.currentTarget.checked)}
        aria-label="新しいマイリスト（ベータ）を使う"
      />
    </label>
  );
}
