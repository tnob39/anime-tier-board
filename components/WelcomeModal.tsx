"use client";

import { X } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

const FIRST_VISIT_KEY = "anime-tier-board:firstVisit";

const features = [
  { icon: "📋", text: "今期アニメを自動取得・一覧表示" },
  { icon: "✅", text: "見たい・視聴中・完了でステータス管理" },
  { icon: "💳", text: "契約サブスクで見放題かを確認" },
  { icon: "⭐", text: "ティア表を作って友達と共有（プロモード）" }
];

const tutorialSteps = [
  { step: 1, title: "今期アニメを確認", body: "トップ画面に今クールのアニメが自動で並びます。気になる作品を探してみましょう。" },
  { step: 2, title: "ステータスを登録", body: "アニメカードをタップして「見たい」「視聴中」などのステータスをつけられます。" },
  { step: 3, title: "視聴管理で整理", body: "「視聴中」メニューからウォッチリストを確認。放送曜日ごとにまとめて見られます。" }
];

export function WelcomeModal() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<"welcome" | "tutorial">("welcome");
  const [tutorialIdx, setTutorialIdx] = useState(0);
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") return;
    if (!localStorage.getItem(FIRST_VISIT_KEY)) {
      setShow(true);
    }
  }, [status]);

  function close() {
    localStorage.setItem(FIRST_VISIT_KEY, "1");
    setShow(false);
  }

  function handleStart() {
    setStep("tutorial");
  }

  function handleTutorialNext() {
    if (tutorialIdx < tutorialSteps.length - 1) {
      setTutorialIdx((prev) => prev + 1);
    } else {
      close();
    }
  }

  if (!show) return null;

  return (
    <div className="welcome-backdrop" onClick={close}>
      <div className="welcome-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="welcome-close-btn" onClick={close} aria-label="閉じる">
          <X size={18} />
        </button>

        {step === "welcome" ? (
          <>
            <div className="welcome-hero">
              <span className="welcome-emoji" aria-hidden="true">🎬</span>
              <h2 className="welcome-title">今期アニメを管理しよう</h2>
              <p className="welcome-subtitle">
                今クールのアニメ一覧を自動取得し、視聴状況を管理できます。
              </p>
            </div>

            <ul className="welcome-features">
              {features.map((f) => (
                <li key={f.text}>
                  <span aria-hidden="true">{f.icon}</span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>

            <div className="welcome-actions">
              <button className="command-button emphasis-button" onClick={handleStart}>
                使い方を見る
              </button>
              <button className="command-button" onClick={close}>
                まず見てみる
              </button>
            </div>

            {status !== "authenticated" && (
              <button
                className="welcome-login-link"
                onClick={() => void signIn("google")}
              >
                Googleでログインして全機能を使う →
              </button>
            )}
          </>
        ) : (
          <>
            <div className="tutorial-progress">
              {tutorialSteps.map((_, i) => (
                <span
                  key={i}
                  className={`tutorial-dot${i === tutorialIdx ? " is-active" : ""}`}
                />
              ))}
            </div>

            <div className="tutorial-step">
              <span className="tutorial-step-num">STEP {tutorialSteps[tutorialIdx].step}</span>
              <h3 className="tutorial-step-title">{tutorialSteps[tutorialIdx].title}</h3>
              <p className="tutorial-step-body">{tutorialSteps[tutorialIdx].body}</p>
            </div>

            <div className="welcome-actions">
              <button className="command-button emphasis-button" onClick={handleTutorialNext}>
                {tutorialIdx < tutorialSteps.length - 1 ? "次へ" : "始める"}
              </button>
              {tutorialIdx > 0 && (
                <button className="command-button" onClick={() => setTutorialIdx((prev) => prev - 1)}>
                  戻る
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
