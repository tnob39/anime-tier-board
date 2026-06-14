"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { countCatchupBadge, updateAppBadge } from "@/lib/badge";
import type { AnimeStatusRecord } from "@/lib/statuses";

export function AppBadgeUpdater() {
  const { status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "authenticated") {
      updateAppBadge(0);
      return;
    }

    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/watchlist");
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { items: AnimeStatusRecord[] };
        updateAppBadge(countCatchupBadge(payload.items));
      } catch {
        // Badge API unsupported or fetch failed — ignore.
      }
    }

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [status, pathname]);

  return null;
}