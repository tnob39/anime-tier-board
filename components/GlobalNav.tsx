"use client";

import { LogOut, Menu, UserCircle2 } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { HamburgerMenu } from "./HamburgerMenu";

export function GlobalNav() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    function handleScroll() {
      setIsCompact(window.scrollY > 40);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <nav
        className={isCompact ? "global-nav is-compact" : "global-nav"}
        role="navigation"
        aria-label="グローバルナビゲーション"
      >
        <div className="global-nav-left">
          <button
            className="global-nav-btn"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="メニューを開く"
            aria-expanded={isDrawerOpen}
          >
            <Menu size={20} />
          </button>
          <a href="/" className="global-nav-logo" aria-label="numanie トップへ">
            numanie
          </a>
        </div>

        <div className="global-nav-right">
          {status !== "loading" && (
            isAuthenticated ? (
              <div className="user-menu-wrap">
                <button
                  className="global-nav-btn user-avatar-btn"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  aria-label="ユーザーメニュー"
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
                    <div className="user-dropdown">
                      <p className="user-dropdown-name">
                        {session?.user?.name ?? session?.user?.email}
                      </p>
                      <button
                        className="user-dropdown-item user-dropdown-logout"
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

      <HamburgerMenu isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
