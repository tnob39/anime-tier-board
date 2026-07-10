"use client";

import Link from "next/link";
import { CreditCard, Layers, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  SUBSC_DISMISS_KEY_PREFIX,
  TIER_DISMISS_KEY_PREFIX,
  shouldShowSubscReviewCard,
  shouldShowTierPromptCard,
  subscDismissStorageKey,
  tierDismissStorageKey,
} from "@/lib/home-context-cards";
import "./home-context-cards.css";

export type HomeContextCardsProps = {
  /** テスト用。未指定時はクライアントの現在時刻。 */
  now?: Date;
};

/**
 * ホーム向け文脈カード（期末 Tier 作成 / 月初サブスク見直し）。
 * 表示条件と dismiss は localStorage + pure helpers で判定。
 * HomeClient はログイン済みのみなのでゲスト flash は発生しない。
 */
export default function HomeContextCards({ now: nowProp }: HomeContextCardsProps) {
  const [now, setNow] = useState<Date>(() => nowProp ?? new Date());
  const [ready, setReady] = useState(false);
  const [tierDismissed, setTierDismissed] = useState(false);
  const [subscDismissed, setSubscDismissed] = useState(false);

  // 開きっぱなしのタブでも日付跨ぎで表示条件・キーが追従するよう now を更新
  useEffect(() => {
    if (nowProp) {
      setNow(nowProp);
      return;
    }
    const refresh = () => setNow(new Date());
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const intervalId = window.setInterval(refresh, 60 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [nowProp]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tierKey = tierDismissStorageKey(now);
    const subscKey = subscDismissStorageKey(now);
    try {
      setTierDismissed(window.localStorage.getItem(tierKey) === "1");
      setSubscDismissed(window.localStorage.getItem(subscKey) === "1");
      // 過去シーズン/過去月の dismiss キーを掃除（無期限蓄積を防ぐ）
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        const isStaleTier = key.startsWith(TIER_DISMISS_KEY_PREFIX) && key !== tierKey;
        const isStaleSubsc = key.startsWith(SUBSC_DISMISS_KEY_PREFIX) && key !== subscKey;
        if (isStaleTier || isStaleSubsc) window.localStorage.removeItem(key);
      }
    } catch {
      // private mode 等で localStorage が使えない場合は dismiss 未読扱い
    }
    setReady(true);
  }, [now]);

  const showTier = ready && shouldShowTierPromptCard(now, tierDismissed);
  const showSubsc = ready && shouldShowSubscReviewCard(now, subscDismissed);

  const dismissTier = useCallback(() => {
    const current = nowProp ?? new Date();
    setNow(current);
    setTierDismissed(true);
    try {
      window.localStorage.setItem(tierDismissStorageKey(current), "1");
    } catch {
      // ignore
    }
  }, [nowProp]);

  const dismissSubsc = useCallback(() => {
    const current = nowProp ?? new Date();
    setNow(current);
    setSubscDismissed(true);
    try {
      window.localStorage.setItem(subscDismissStorageKey(current), "1");
    } catch {
      // ignore
    }
  }, [nowProp]);

  if (!showTier && !showSubsc) {
    return null;
  }

  return (
    <section className="hcc-stack" aria-label="おすすめの次のアクション">
      {showTier ? (
        <article className="hcc-card" aria-labelledby="hcc-tier-title">
          <div className="hcc-card-top">
            <div className="hcc-icon-wrap" aria-hidden>
              <Layers size={18} strokeWidth={2} />
            </div>
            <div className="hcc-copy">
              <h2 className="hcc-title" id="hcc-tier-title">
                今期Tierを作ろう
              </h2>
              <p className="hcc-body">
                今期見たアニメを振り返って、あなたのTier表を共有しませんか
              </p>
            </div>
            <button
              type="button"
              className="hcc-dismiss"
              aria-label="閉じる"
              onClick={dismissTier}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <Link href="/tier" className="hcc-cta">
            Tier表をつくる
          </Link>
        </article>
      ) : null}

      {showSubsc ? (
        <article className="hcc-card" aria-labelledby="hcc-subsc-title">
          <div className="hcc-card-top">
            <div className="hcc-icon-wrap" aria-hidden>
              <CreditCard size={18} strokeWidth={2} />
            </div>
            <div className="hcc-copy">
              <h2 className="hcc-title" id="hcc-subsc-title">
                サブスクを見直す
              </h2>
              <p className="hcc-body">
                加入中サービスでウォッチリストの何%が見られるかチェック
              </p>
            </div>
            <button
              type="button"
              className="hcc-dismiss"
              aria-label="閉じる"
              onClick={dismissSubsc}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <Link href="/dashboard?section=subscriptions" className="hcc-cta">
            カバー率を見る
          </Link>
        </article>
      ) : null}
    </section>
  );
}
