"use client";

import {
  Home,
  ListChecks,
  Search,
  Table2,
  User,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import { seasonAwareHref } from "@/lib/season-url";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home, exact: true },
  { href: "/tier", label: "Tier", icon: Table2, exact: false },
  { href: "/explore", label: "さがす", icon: Search, exact: false },
  { href: "/watchlist", label: "マイリスト", icon: ListChecks, exact: false },
  { href: "/mypage", label: "マイページ", icon: User, exact: false },
];

export function MobileNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <nav className="mobile-bottom-nav" aria-label="主要ページ">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            className={`mobile-bottom-nav-link${item.href === "/tier" ? " mobile-bottom-nav-tier" : ""}${active ? " is-active" : ""}`}
            href={seasonAwareHref(item.href === "/tier" ? "/tier/impressions" : item.href, pathname, new URLSearchParams(searchParams.toString()))}
            aria-label={item.href === "/tier" ? "Tier 今期チェック" : undefined}
            aria-current={active ? "page" : undefined}
            onClick={() => track({ name: "tab_switch", to: item.href === "/tier" ? "/tier/impressions" : item.href })}
          >
            <span className="mobile-nav-icon-wrap">
              <Icon size={19} aria-hidden="true" />
            </span>
            {item.href === "/tier" ? (
              <span className="mobile-nav-tier-label">今期チェック</span>
            ) : <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
