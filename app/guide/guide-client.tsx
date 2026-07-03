"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type GuideStep = {
  key: string;
  title: string;
  description: string;
  demo: ReactNode;
};

const steps: GuideStep[] = [
  {
    key: "home",
    title: "ホーム",
    description: "今期アニメと放映カレンダーをひと目で確認できます。",
    demo: (
      <div className="guide-demo-home" aria-hidden="true">
        <div className="guide-demo-heading" />
        <div className="guide-demo-card-row">
          <span /><span /><span />
        </div>
        <div className="guide-demo-calendar">
          <span /><span /><span />
        </div>
      </div>
    ),
  },
  {
    key: "tier",
    title: "Tier",
    description: "作品を S / A / B にドラッグして、自分だけのランキングを作れます。",
    demo: (
      <div className="guide-demo-tier" aria-hidden="true">
        {["S", "A", "B"].map((tier) => (
          <div className="guide-demo-tier-row" key={tier}>
            <strong>{tier}</strong>
            <span className={tier === "A" ? "guide-demo-moving-card" : ""} />
          </div>
        ))}
      </div>
    ),
  },
  {
    key: "watchlist",
    title: "マイリスト",
    description: "見たい作品や視聴中の作品を、カードからワンタップで管理できます。",
    demo: (
      <div className="guide-demo-watchlist" aria-hidden="true">
        <div className="guide-demo-poster" />
        <div className="guide-demo-watchlist-copy">
          <span /><span />
          <div className="guide-demo-check">✓<i /></div>
        </div>
      </div>
    ),
  },
  {
    key: "subscriptions",
    title: "サブスク連動",
    description: "加入サービスに合わせて、今すぐ見られる作品がわかります。",
    demo: (
      <div className="guide-demo-services" aria-hidden="true">
        <span>見放題</span><span>配信中</span><span>今すぐ見る</span>
      </div>
    ),
  },
  {
    key: "share",
    title: "シェア",
    description: "作ったTier表やマイリストを、布教カードにして友達へ共有できます。",
    demo: (
      <div className="guide-demo-share" aria-hidden="true">
        <strong>今期のおすすめ</strong>
        <div><span /><span /><span /></div>
        <small>numanie</small>
      </div>
    ),
  },
];

export function GuideClient() {
  const [currentStep, setCurrentStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [manuallyControlled, setManuallyControlled] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (reducedMotion !== false || manuallyControlled) return;

    const interval = window.setInterval(() => {
      setCurrentStep((step) => (step + 1) % steps.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [reducedMotion, manuallyControlled]);

  const selectStep = (step: number) => {
    setManuallyControlled(true);
    setCurrentStep(step);
  };

  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep];

  return (
    <main className="guide-main">
      <header className="guide-header">
        <p className="eyebrow">使い方</p>
        <h1>numanieをはじめよう</h1>
        <p>主要な機能を5つのステップで紹介します。</p>
      </header>

      <section className="guide-carousel" aria-roledescription="カルーセル" aria-label="numanieの使い方">
        <div className="guide-stage">
          <article
            className="guide-step"
            key={step.key}
            aria-live="polite"
            aria-label={`${currentStep + 1} / ${steps.length}: ${step.title}`}
          >
            <div className="guide-demo">{step.demo}</div>
            <p className="guide-step-number">STEP {currentStep + 1}</p>
            <h2>{step.title}</h2>
            <p>{step.description}</p>
          </article>
        </div>

        <div className="guide-dots" role="group" aria-label="ステップを選択">
          {steps.map((item, index) => (
            <button
              type="button"
              className={`guide-dot${index === currentStep ? " is-active" : ""}`}
              key={item.key}
              onClick={() => selectStep(index)}
              aria-label={`${index + 1}: ${item.title}`}
              aria-current={index === currentStep ? "step" : undefined}
            />
          ))}
        </div>

        <div className="guide-actions">
          <button
            type="button"
            className="guide-action-button"
            onClick={() => selectStep(currentStep - 1)}
            disabled={currentStep === 0}
          >
            戻る
          </button>
          {isLastStep ? (
            <Link className="guide-action-button guide-action-primary" href="/">
              はじめる
            </Link>
          ) : (
            <button
              type="button"
              className="guide-action-button guide-action-primary"
              onClick={() => selectStep(currentStep + 1)}
            >
              次へ
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
