"use client";

import {
  BarChart3,
  Home,
  ListChecks,
  Search,
  Table2,
  User,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { track } from "@/lib/analytics";
import { isOwnerEmail } from "@/lib/owner";
import { useNavV5 } from "@/lib/nav-flag";
import { seasonAwareHref } from "@/lib/season-url";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  ownerOnly?: boolean;
};

// 方針③ N1a: モード別の2配列を廃止し、単一4タブに統合。
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home, exact: true },
  { href: "/tier", label: "Tier", icon: Table2, exact: false },
  { href: "/dashboard", label: "分析", icon: BarChart3, exact: false },
  { href: "/explore", label: "さがす", icon: Search, exact: false, ownerOnly: true },
];

const NAV_ITEMS_V5: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home, exact: true },
  { href: "/tier", label: "Tier", icon: Table2, exact: false },
  { href: "/explore", label: "さがす", icon: Search, exact: false, ownerOnly: true },
  { href: "/watchlist", label: "マイリスト", icon: ListChecks, exact: false },
  { href: "/mypage", label: "マイページ", icon: User, exact: false },
];

export function MobileNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isOwner = isOwnerEmail(session?.user?.email);
  const navV5 = useNavV5();

  const visibleItems = (navV5 ? NAV_ITEMS_V5 : NAV_ITEMS)
    .filter((item) => !item.ownerOnly || isOwner);

  return (
    <nav className="mobile-bottom-nav" aria-label="主要ページ">
      {visibleItems.map((item) => {
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
