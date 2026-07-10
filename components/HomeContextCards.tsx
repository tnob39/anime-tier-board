"use client";

import Link from "next/link";
import { CreditCard, Layers, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const [ready, setReady] = useState(false);
  const [tierDismissed, setTierDismissed] = useState(false);
  const [subscDismissed, setSubscDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setTierDismissed(window.localStorage.getItem(tierDismissStorageKey(now)) === "1");
      setSubscDismissed(window.localStorage.getItem(subscDismissStorageKey(now)) === "1");
    } catch {
      // private mode 等で localStorage が使えない場合は dismiss 未読扱い
    }
    setReady(true);
  }, [now]);

  const showTier = ready && shouldShowTierPromptCard(now, tierDismissed);
  const showSubsc = ready && shouldShowSubscReviewCard(now, subscDismissed);

  const dismissTier = useCallback(() => {
    setTierDismissed(true);
    try {
      window.localStorage.setItem(tierDismissStorageKey(now), "1");
    } catch {
      // ignore
    }
  }, [now]);

  const dismissSubsc = useCallback(() => {
    setSubscDismissed(true);
    try {
      window.localStorage.setItem(subscDismissStorageKey(now), "1");
    } catch {
      // ignore
    }
  }, [now]);

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
