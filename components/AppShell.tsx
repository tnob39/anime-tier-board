"use client";

import { usePathname } from "next/navigation";
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
    return <>{children}</>;
  }

  return (
    <>
      <GlobalNav />
      {children}
      <MobileNav />
    </>
  );
}
