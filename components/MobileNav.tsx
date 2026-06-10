"use client";

import { BarChart3, Compass, CreditCard, ListChecks, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUiMode } from "@/lib/ui-mode";

const allNavItems = [
  { href: "/", label: "Tier", icon: Table2, proOnly: false },
  { href: "/watchlist", label: "視聴中", icon: ListChecks, proOnly: false },
  { href: "/subscriptions", label: "サブスク", icon: CreditCard, proOnly: false },
  { href: "/explore", label: "探す", icon: Compass, proOnly: true },
  { href: "/dashboard", label: "分析", icon: BarChart3, badge: true, proOnly: true }
];

export function MobileNav() {
  const pathname = usePathname();
  const { mode } = useUiMode();

  const navItems = mode === "simple"
    ? allNavItems.filter((item) => !item.proOnly)
    : allNavItems;

  return (
    <nav className="mobile-bottom-nav" aria-label="主要ページ">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            className={active ? "mobile-bottom-nav-link is-active" : "mobile-bottom-nav-link"}
            href={item.href}
          >
            <span className="mobile-nav-icon-wrap">
              <Icon size={19} />
              {"badge" in item && item.badge ? (
                <span className="mobile-nav-badge" aria-hidden="true" />
              ) : null}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
