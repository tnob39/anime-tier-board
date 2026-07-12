"use client";

import {
  BookOpen,
  CreditCard,
  Lock,
  Megaphone,
  Mic2,
  Settings,
  X
} from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ThemeSwitch } from "./ThemeSwitch";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

// ボトムタブにないページのみ
const navItems = [
  { href: "/guide", label: "使い方", icon: BookOpen },
  { href: "/dashboard?section=subscriptions", label: "サブスク", icon: CreditCard },
  { href: "/voice-actors", label: "声優", icon: Mic2 },
  { href: "/settings", label: "設定", icon: Settings },
];

const loginRequiredHrefs = new Set([
  "/dashboard?section=subscriptions",
  "/voice-actors",
  "/settings",
]);

export function HamburgerMenu({ isOpen, onClose }: Props) {
  const { status } = useSession();
  const isLoggedOut = status === "unauthenticated";
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="hamburger-overlay" aria-modal="true" role="dialog" aria-labelledby="hamburger-menu-title">
      <div className="hamburger-backdrop" onClick={onClose} aria-hidden="true" />

      <aside className="hamburger-drawer">
        <div className="hamburger-head">
          <span className="hamburger-title" id="hamburger-menu-title">設定</span>
          <button
            ref={closeButtonRef}
            className="hamburger-close-btn"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </div>

        <section className="hamburger-section">
          <p className="hamburger-section-label">テーマ</p>
          <ThemeSwitch />
        </section>

        <div className="hamburger-divider" />

        <section className="hamburger-section">
          <p className="hamburger-section-label">その他</p>
          <nav>
            {navItems.map((item) => {
              const Icon = item.icon;
              if (isLoggedOut && loginRequiredHrefs.has(item.href)) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    className="hamburger-nav-item"
                    onClick={() => signIn("google")}
                  >
                    <Icon size={18} className="hamburger-nav-icon" />
                    <span>{item.label}</span>
                    <Lock size={14} className="hamburger-locked-icon" aria-hidden="true" />
                  </button>
                );
              }
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
          {isLoggedOut && (
            <p className="hamburger-locked-hint">
              ログインすると、サブスク・声優・設定を利用できます。
            </p>
          )}
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
