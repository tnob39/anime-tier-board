"use client";

import {
  Check,
  CreditCard,
  Megaphone,
  Mic2,
  Settings,
  X
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { isOwnerEmail } from "@/lib/owner";
import { useWatchlistMode, type WatchlistMode } from "@/lib/watchlist-flag";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const modeOptions: { mode: WatchlistMode; label: string; dot: string }[] = [
  { mode: "off", label: "通常版", dot: "wl2-modeswitch-dot--off" },
  { mode: "codex", label: "Codex版", dot: "wl2-modeswitch-dot--codex" },
  { mode: "grok", label: "Grok版", dot: "wl2-modeswitch-dot--grok" }
];

// ボトムタブにないページのみ
const navItems = [
  { href: "/dashboard?section=subscriptions", label: "サブスク", icon: CreditCard },
  { href: "/voice-actors", label: "声優", icon: Mic2 },
  { href: "/settings", label: "設定", icon: Settings },
];

export function HamburgerMenu({ isOpen, onClose }: Props) {
  const { data: session } = useSession();
  const canPreview = isOwnerEmail(session?.user?.email);
  const [mode, setMode] = useWatchlistMode();

  function selectMode(next: WatchlistMode) {
    setMode(next);
    onClose();
    // mode は localStorage 駆動で /watchlist 側は mount 時に読むため、確実に反映させるべく遷移する。
    window.location.assign("/watchlist");
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="hamburger-overlay" aria-modal="true" role="dialog">
      <div className="hamburger-backdrop" onClick={onClose} aria-hidden="true" />

      <aside className="hamburger-drawer">
        <div className="hamburger-head">
          <span className="hamburger-title">設定</span>
          <button className="hamburger-close-btn" onClick={onClose} aria-label="閉じる">
            <X size={20} />
          </button>
        </div>

        <section className="hamburger-section">
          <p className="hamburger-section-label">その他</p>
          <nav>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hamburger-nav-item"
                  onClick={onClose}
                >
                  <Icon size={18} className="hamburger-nav-icon" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </section>

        {canPreview && (
          <>
            <div className="hamburger-divider" />
            <section className="hamburger-section">
              <p className="hamburger-section-label hamburger-owner-label">
                視聴管理リスト
                <span className="hamburger-owner-tag">オーナー限定</span>
              </p>
              <div className="wl2-modeswitch" role="radiogroup" aria-label="視聴管理リストの実装版">
                {modeOptions.map((opt) => {
                  const active = mode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={active ? "wl2-modeswitch-btn is-active" : "wl2-modeswitch-btn"}
                      onClick={() => selectMode(opt.mode)}
                    >
                      <span className={`wl2-modeswitch-dot ${opt.dot}`} aria-hidden="true" />
                      <span>{opt.label}</span>
                      {active && <Check size={16} className="wl2-modeswitch-check" />}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <div className="hamburger-divider" />

        <section className="hamburger-section">
          <Link href="/updates" className="hamburger-nav-item" onClick={onClose}>
            <Megaphone size={18} className="hamburger-nav-icon" />
            <span>更新情報</span>
          </Link>
        </section>
      </aside>
    </div>
  );
}
