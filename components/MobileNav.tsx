"use client";

import {
  BarChart3,
  Home,
  Search,
  Table2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { isOwnerEmail } from "@/lib/owner";

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

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isOwner = isOwnerEmail(session?.user?.email);

  const visibleItems = NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner);

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
