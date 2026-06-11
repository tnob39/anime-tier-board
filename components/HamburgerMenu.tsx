"use client";

import {
  Megaphone,
  Mic2,
  Settings,
  X
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useUiMode, type UiMode } from "@/lib/ui-mode";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

// ボトムタブにないページのみ
const navItems = [
  { href: "/voice-actors", label: "声優", icon: Mic2 },
];

const modeOptions: Array<{ value: UiMode; label: string; desc: string }> = [
  { value: "simple", label: "シンプル", desc: "視聴管理に集中" },
  { value: "pro", label: "プロ", desc: "全機能を使う" }
];

export function HamburgerMenu({ isOpen, onClose }: Props) {
  const { mode, setMode } = useUiMode();

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
          <p className="hamburger-section-label">表示モード</p>
          <div className="hamburger-mode-toggle">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                className={`hamburger-mode-btn${mode === option.value ? " is-active" : ""}`}
                onClick={() => setMode(option.value)}
                aria-pressed={mode === option.value}
              >
                <span className="hamburger-mode-label">{option.label}</span>
                <span className="hamburger-mode-desc">{option.desc}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="hamburger-divider" />

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

        <div className="hamburger-divider" />

        <section className="hamburger-section">
          <Link href="/updates" className="hamburger-nav-item" onClick={onClose}>
            <Megaphone size={18} className="hamburger-nav-icon" />
            <span>更新情報</span>
          </Link>
          <Link href="/settings" className="hamburger-nav-item" onClick={onClose}>
            <Settings size={18} className="hamburger-nav-icon" />
            <span>設定</span>
          </Link>
        </section>
      </aside>
    </div>
  );
}
