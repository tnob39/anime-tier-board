"use client";

import Link from "next/link";
import { LogOut, Menu, User, UserCircle2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { HamburgerMenu } from "./HamburgerMenu";
import { useNavV5 } from "@/lib/nav-flag";
import { isOwnerEmail } from "@/lib/owner";

const NAV_ITEMS = [
  { href: "/", label: "ホーム", exact: true },
  { href: "/tier", label: "Tier", exact: false },
  { href: "/dashboard", label: "分析", exact: false },
  { href: "/watchlist", label: "マイリスト", exact: false },
  { href: "/explore", label: "さがす", exact: false, ownerOnly: true },
];

export function GlobalNav() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const pathname = usePathname();
  const isOwner = isOwnerEmail(session?.user?.email);
  const navV5 = useNavV5();
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner);
  const userMenuFirstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    function handleScroll() {
      setIsCompact(window.scrollY > 40);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    userMenuFirstItemRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [isUserMenuOpen]);

  return (
    <>
      <nav
        className={isCompact ? "global-nav is-compact" : "global-nav"}
        role="navigation"
        aria-label="グローバルナビゲーション"
      >
        <div className="global-nav-left">
          {navV5 ? (
            <Link href="/mypage" className="global-nav-btn" aria-label="マイページ">
              <User size={20} />
            </Link>
          ) : (
            <button
              className="global-nav-btn"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="メニューを開く"
              aria-expanded={isDrawerOpen}
            >
              <Menu size={20} />
            </button>
          )}
          <Link href="/" className="global-nav-logo" aria-label="numanie トップへ">
            numanie
          </Link>
          <nav className="global-nav-links" aria-label="主要ページ（デスクトップ）">
            {visibleNavItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "global-nav-link is-active" : "global-nav-link"}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="global-nav-right">
          {status !== "loading" && (
            isAuthenticated ? (
              <div className="user-menu-wrap">
                <button
                  className="global-nav-btn user-avatar-btn"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  aria-label="ユーザーメニュー"
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                >
                  <UserCircle2 size={26} className="user-avatar-placeholder" />
                </button>

                {isUserMenuOpen && (
                  <>
                    <div
                      className="user-menu-backdrop"
                      onClick={() => setIsUserMenuOpen(false)}
                    />
                    <div className="user-dropdown" role="menu">
                      <p className="user-dropdown-name">
                        {session?.user?.name ?? session?.user?.email}
                      </p>
                      <Link
                        ref={userMenuFirstItemRef}
                        href="/mypage"
                        className="user-dropdown-item"
                        role="menuitem"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <User size={15} />
                        <span>マイページ</span>
                      </Link>
                      <button
                        className="user-dropdown-item user-dropdown-logout"
                        role="menuitem"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          void signOut();
                        }}
                      >
                        <LogOut size={15} />
                        <span>ログアウト</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                className="global-nav-btn user-avatar-btn"
                onClick={() => void signIn("google")}
                aria-label="Googleでログイン"
                title="Googleでログイン"
              >
                <UserCircle2 size={26} className="user-avatar-placeholder" />
              </button>
            )
          )}
        </div>
      </nav>

      {!navV5 ? (
        <HamburgerMenu isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      ) : null}
    </>
  );
}
