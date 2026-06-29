"use client";

import {
  BarChart3,
  ChevronRight,
  CreditCard,
  Megaphone,
  Mic2,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { ThemeSwitch } from "@/components/ThemeSwitch";

const links = [
  { href: "/dashboard", label: "分析", icon: BarChart3 },
  { href: "/dashboard?section=subscriptions", label: "サブスク", icon: CreditCard },
  { href: "/voice-actors", label: "声優", icon: Mic2 },
  { href: "/settings", label: "設定", icon: Settings },
  { href: "/updates", label: "更新情報", icon: Megaphone },
];

export function MyPageClient() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";

  return (
    <main className="app-main mypage-main">
      <header className="mypage-header">
        <p className="eyebrow">マイページ</p>
        <h1>マイページ</h1>
      </header>

      <section className="mypage-section">
        <h2>アカウント</h2>
        {isAuthenticated ? (
          <>
            <div className="mypage-account">
              {session?.user?.name ? <strong>{session.user.name}</strong> : null}
              {session?.user?.email ? <span>{session.user.email}</span> : null}
            </div>
            <button
              type="button"
              className="command-button"
              onClick={() => void signOut()}
            >
              ログアウト
            </button>
          </>
        ) : (
          <button
            type="button"
            className="command-button emphasis-button"
            onClick={() => void signIn("google")}
            disabled={status === "loading"}
          >
            Googleでログイン
          </button>
        )}
      </section>

      <section className="mypage-section">
        <h2>メニュー</h2>
        <nav aria-label="マイページメニュー">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="hamburger-nav-item">
                <Icon size={18} className="hamburger-nav-icon" />
                <span>{item.label}</span>
                <ChevronRight size={18} className="mypage-link-arrow" />
              </Link>
            );
          })}
        </nav>
      </section>

      <section className="mypage-section">
        <h2>テーマ</h2>
        <ThemeSwitch />
      </section>
    </main>
  );
}
