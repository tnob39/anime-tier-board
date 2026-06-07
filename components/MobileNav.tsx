"use client";

import { BarChart3, Compass, CreditCard, ListChecks, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Tier", icon: Table2 },
  { href: "/watchlist", label: "視聴中", icon: ListChecks },
  { href: "/explore", label: "探す", icon: Compass },
  { href: "/subscriptions", label: "サブスク", icon: CreditCard },
  { href: "/dashboard", label: "分析", icon: BarChart3, badge: true }
];

export function MobileNav() {
  const pathname = usePathname();

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
              {item.badge ? <span className="mobile-nav-badge" aria-hidden="true" /> : null}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
