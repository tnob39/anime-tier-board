"use client";

import {
  Check,
  CreditCard,
  Megaphone,
  Mic2,
  Monitor,
  Moon,
  Settings,
  Sun,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useTheme, type ThemePref } from "@/lib/theme";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const themeOptions: { pref: ThemePref; label: string; icon: LucideIcon }[] = [
  { pref: "light", label: "ライト", icon: Sun },
  { pref: "dark", label: "ダーク", icon: Moon },
  { pref: "system", label: "システム", icon: Monitor }
];

// ボトムタブにないページのみ
const navItems = [
  { href: "/dashboard?section=subscriptions", label: "サブスク", icon: CreditCard },
  { href: "/voice-actors", label: "声優", icon: Mic2 },
  { href: "/settings", label: "設定", icon: Settings },
];

export function HamburgerMenu({ isOpen, onClose }: Props) {
  const [themePref, setThemePref] = useTheme();

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
          <p className="hamburger-section-label">テーマ</p>
          <div className="theme-switch" role="radiogroup" aria-label="テーマ">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const active = themePref === opt.pref;
              return (
                <button
                  key={opt.pref}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? "theme-switch-btn is-active" : "theme-switch-btn"}
                  onClick={() => setThemePref(opt.pref)}
                >
                  <Icon size={16} className="theme-switch-icon" />
                  <span>{opt.label}</span>
                  {active && <Check size={15} className="theme-switch-check" />}
                </button>
              );
            })}
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
        </section>
      </aside>
    </div>
  );
}
