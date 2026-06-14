"use client";

import {
  BarChart3,
  Compass,
  CreditCard,
  Home,
  ListChecks,
  Search,
  Table2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUiMode } from "@/lib/ui-mode";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
};

const SIMPLE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home, exact: true },
  { href: "/watchlist", label: "視聴中", icon: ListChecks, exact: false },
  { href: "/explore", label: "さがす", icon: Search, exact: false },
  { href: "/subscriptions", label: "サブスク", icon: CreditCard, exact: false },
];

const PRO_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home, exact: true },
  { href: "/tier", label: "Tier", icon: Table2, exact: false },
  { href: "/dashboard", label: "分析", icon: BarChart3, exact: false },
  { href: "/explore", label: "探索", icon: Compass, exact: false },
];

export function MobileNav() {
  const pathname = usePathname();
  const { mode } = useUiMode();
  const navItems = mode === "pro" ? PRO_NAV_ITEMS : SIMPLE_NAV_ITEMS;

  return (
    <nav className="mobile-bottom-nav" aria-label="主要ページ">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            className={active ? "mobile-bottom-nav-link is-active" : "mobile-bottom-nav-link"}
            href={item.href}
          >
            <span className="mobile-nav-icon-wrap">
              <Icon size={19} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}