"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./tier-area-nav.css";

export function TierAreaNav() {
  const path = usePathname();
  return <nav className="tier-area-nav" aria-label="Tierのページ">
    <Link href="/tier" aria-current={path === "/tier" ? "page" : undefined}>Tier表</Link>
    <Link href="/tier/impressions" aria-current={path === "/tier/impressions" ? "page" : undefined}>今期チェック</Link>
  </nav>;
}
