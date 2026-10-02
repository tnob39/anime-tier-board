"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { seasonAwareHref } from "@/lib/season-url";
import "./tier-area-nav.css";

export function TierAreaNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname !== "/tier" && !pathname.startsWith("/tier/")) return null;

  return (
    <nav className="tier-area-nav" aria-label="Tierの表示切り替え">
      {[
        { href: "/tier", label: "Tier表" },
        { href: "/tier/impressions", label: "今期チェック" }
      ].map((item) => (
        <Link
          key={item.href}
          href={seasonAwareHref(item.href, pathname, new URLSearchParams(searchParams.toString()))}
          className="command-button"
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
