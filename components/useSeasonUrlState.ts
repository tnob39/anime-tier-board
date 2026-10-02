"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  equalSeasonRef,
  getCurrentAnimeSeason,
  type SeasonRef
} from "@/lib/season";
import {
  buildSeasonHref,
  canonicalizeSeasonSearchParams,
  resolveSeasonQuery
} from "@/lib/season-url";

export type SeasonUrlMode = "implicit-current" | "explicit";

function liveSearchParams(fallback: { toString(): string }): URLSearchParams {
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams(fallback.toString());
}

function writeSeasonHistory(ref: SeasonRef | null, historyMode: "push" | "replace"): void {
  if (typeof window === "undefined") {
    return;
  }
  const href = buildSeasonHref(
    window.location.pathname,
    window.location.search,
    ref,
    window.location.hash
  );
  if (historyMode === "push") {
    window.history.pushState(null, "", href);
  } else {
    window.history.replaceState(null, "", href);
  }
}

export function useSeasonUrlState(initial: SeasonRef, enabled = true) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useMemo(() => getCurrentAnimeSeason(), []);
  const resolved = resolveSeasonQuery(searchParams);
  const fromLocation = resolved.explicit ? resolved.ref : initial;

  const [ref, setLocalRef] = useState<SeasonRef>(fromLocation);
  const [explicit, setExplicit] = useState(resolved.explicit);
  const routerSearch = searchParams.toString();

  const applyResolved = useCallback(
    (nextResolved: ReturnType<typeof resolveSeasonQuery>) => {
      setLocalRef((previous) => equalSeasonRef(previous, nextResolved.ref) ? previous : nextResolved.ref);
      setExplicit(nextResolved.explicit);
    },
    []
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    // Router snapshots can lag behind consecutive native history writes.
    const canonical = canonicalizeSeasonSearchParams(liveSearchParams(new URLSearchParams(routerSearch)));
    if (canonical.didChange && typeof window !== "undefined") {
      const nextHref = `${window.location.pathname}${canonical.search ? `?${canonical.search}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", nextHref);
    }
    applyResolved(canonical);
  }, [applyResolved, enabled, pathname, routerSearch]);

  useEffect(() => {
    function onPopState() {
      applyResolved(resolveSeasonQuery(new URLSearchParams(window.location.search)));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyResolved]);

  const setRef = useCallback(
    (next: SeasonRef, mode: SeasonUrlMode = "explicit", historyMode: "push" | "replace" = "push") => {
      const nowCurrent = getCurrentAnimeSeason();
      const stored =
        mode === "explicit" ? next : equalSeasonRef(next, nowCurrent) ? null : next;
      const displayed = stored ?? nowCurrent;
      setLocalRef(displayed);
      setExplicit(stored != null);
      writeSeasonHistory(stored, historyMode);
    },
    []
  );

  return {
    ref,
    current,
    isCurrent: equalSeasonRef(ref, current),
    explicit,
    setRef
  };
}
