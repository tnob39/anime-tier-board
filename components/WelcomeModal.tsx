"use client";

import { X } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

const FIRST_VISIT_KEY = "anime-tier-board:firstVisit";

const features = [
  { icon: "📋", text: "今期アニメを自動取得・一覧表示" },
  { icon: "✅", text: "見たい・視聴中・完了でステータス管理" },
  { icon: "💳", text: "契約サブスクで見放題かを確認" },
  { icon: "⭐", text: "Tier表を作って自分の評価を残す（プロモード）" }
];

export function WelcomeModal() {
  const [show, setShow] = useState(false);
  const { status } = useSession();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

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

  useEffect(() => {
    if (!show) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="welcome-backdrop" onClick={close}>
      <div
        className="welcome-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={modalRef}
      >
        <button className="welcome-close-btn" onClick={close} aria-label="閉じる" ref={closeButtonRef}>
          <X size={18} />
        </button>

        <div className="welcome-hero">
          <div className="welcome-symbol" aria-hidden="true">
            <span>n</span>
          </div>
          <h2 className="welcome-title" id={titleId}>アニメを、自分のものに。</h2>
          <p className="welcome-subtitle">
            見たアニメをTierで整理して、視聴履歴を積み上げよう
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
          <button className="command-button emphasis-button" onClick={close}>
            始める
          </button>
        </div>

        {status !== "authenticated" && (
          <button
            className="welcome-login-link"
            onClick={() => void signIn("google")}
          >
            Googleでログイン →
          </button>
        )}
      </div>
    </div>
  );
}
