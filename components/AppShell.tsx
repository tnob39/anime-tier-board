"use client";

import { usePathname } from "next/navigation";
import { AppBadgeUpdater } from "./AppBadgeUpdater";
import { GlobalNav } from "./GlobalNav";
import { MobileNav } from "./MobileNav";

const PUBLIC_PREFIXES = [
  "/share/",
  "/watchlist/share/",
  "/dashboard/share/",
  "/onboarding",
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return <main id="main-content">{children}</main>;
  }

  return (
    <>
      <GlobalNav />
      <AppBadgeUpdater />
      <main id="main-content">{children}</main>
      <MobileNav />
    </>
  );
}
