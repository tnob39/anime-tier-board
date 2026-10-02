"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ANIME_SEASONS,
  autoDetectedSeasonLabelJa,
  currentSeasonLabelJa,
  equalSeasonRef,
  getCurrentAnimeSeason,
  listCompactSeasonSelectorYears,
  nextSeason,
  previousSeason,
  SEASON_NAME_JA,
  seasonHeadingJa,
  selectedSeasonLabelJa,
  type SeasonRef
} from "@/lib/season";
import {
  mergeSeasonPatch,
  readSeasonContextFromLocation,
  resolveSeasonQuery,
  serializeSeasonPath
} from "@/lib/season-url";

type SeasonContextControlProps = {
  value: SeasonRef;
  onChange?: (next: SeasonRef) => void;
  years?: number[];
  disabled?: boolean;
  navigationMode?: "query" | "path";
  headingId?: string;
  allowYearScope?: boolean;
  yearScope?: boolean;
  onYearScopeChange?: (year: number) => void;
};

export function SeasonContextControl({
  value,
  onChange,
  years,
  disabled = false,
  navigationMode = "query",
  headingId,
  allowYearScope = false,
  yearScope = false,
  onYearScopeChange
}: SeasonContextControlProps) {
  const router = useRouter();
  const current = getCurrentAnimeSeason();
  const latestRef = useRef<SeasonRef>({ year: value.year, season: value.season });
  const pendingRef = useRef<SeasonRef | null>(null);
  const pendingYearScopeRef = useRef<boolean | null>(null);
  const [display, setDisplay] = useState<SeasonRef>({ year: value.year, season: value.season });
  const [displayYearScope, setDisplayYearScope] = useState(yearScope);
  const yearOptions = years ?? listCompactSeasonSelectorYears(new Date(), display.year);

  useEffect(() => {
    const pending = pendingRef.current;
    const pendingYearScope = pendingYearScopeRef.current;
    if (pending != null || pendingYearScope != null) {
      const yearCaughtUp = pending == null || equalSeasonRef(value, pending);
      const scopeCaughtUp = pendingYearScope == null || yearScope === pendingYearScope;
      if (yearCaughtUp && scopeCaughtUp) {
        pendingRef.current = null;
        pendingYearScopeRef.current = null;
      } else {
        return;
      }
    }
    latestRef.current = { year: value.year, season: value.season };
    setDisplay({ year: value.year, season: value.season });
    setDisplayYearScope(yearScope);
  }, [value.year, value.season, yearScope]);

  useEffect(() => {
    function onPopState() {
      pendingRef.current = null;
      pendingYearScopeRef.current = null;
      if (typeof window === "undefined") {
        return;
      }
      const fromPath = readSeasonContextFromLocation(
        window.location.pathname,
        new URLSearchParams(window.location.search)
      );
      if (navigationMode === "path" && fromPath) {
        latestRef.current = fromPath;
        setDisplay(fromPath);
        setDisplayYearScope(false);
        return;
      }
      const resolved = resolveSeasonQuery(
        new URLSearchParams(window.location.search),
        new Date(),
        { allowYearOnly: allowYearScope }
      );
      const nextRef = resolved.explicit ? resolved.ref : getCurrentAnimeSeason();
      latestRef.current = nextRef;
      setDisplay(nextRef);
      setDisplayYearScope(Boolean(resolved.yearScope));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [allowYearScope, navigationMode]);

  function liveCanonical(): SeasonRef {
    if (navigationMode === "path" && pendingRef.current) {
      return pendingRef.current;
    }
    if (typeof window !== "undefined") {
      const fromUrl = readSeasonContextFromLocation(
        window.location.pathname,
        new URLSearchParams(window.location.search),
        new Date(),
        { allowYearOnly: allowYearScope }
      );
      if (fromUrl) {
        latestRef.current = fromUrl;
        return fromUrl;
      }
      if (navigationMode === "query") {
        return getCurrentAnimeSeason();
      }
    }
    return latestRef.current;
  }

  function commit(next: SeasonRef) {
    if (disabled) {
      return;
    }
    const canonical = liveCanonical();
    if (!(pendingYearScopeRef.current ?? displayYearScope) && equalSeasonRef(next, canonical)) {
      return;
    }
    latestRef.current = next;
    pendingRef.current = next;
    pendingYearScopeRef.current = false;
    setDisplay(next);
    setDisplayYearScope(false);
    if (navigationMode === "path") {
      router.push(serializeSeasonPath(next));
      return;
    }
    onChange?.(next);
  }

  function commitYearScope(year: number) {
    if (disabled) {
      return;
    }
    const next = { year, season: liveCanonical().season };
    latestRef.current = next;
    pendingRef.current = next;
    pendingYearScopeRef.current = true;
    setDisplay(next);
    setDisplayYearScope(true);
    onYearScopeChange?.(year);
  }

  const isCurrent = !displayYearScope && equalSeasonRef(display, current);
  const statusText = displayYearScope
    ? `選択中の年（${display.year}年・全年）`
    : isCurrent
      ? currentSeasonLabelJa(display)
      : selectedSeasonLabelJa(display);

  return (
    <div
      className="season-context-control"
      data-season-context-year={display.year}
      data-season-context-season={displayYearScope ? "ALL" : display.season}
      data-season-context-kind={displayYearScope ? "year" : isCurrent ? "current" : "selected"}
    >
      <p
        className="season-context-status"
        data-season-heading="true"
        id={headingId}
      >
        {statusText}
      </p>
      {displayYearScope ? (
        <p className="season-context-note">
          {display.year}年の全年です。クールを選ぶと{selectedSeasonLabelJa(display)}になります。今期は {currentSeasonLabelJa(current)} です。
        </p>
      ) : isCurrent ? (
        <p className="season-context-note">自動判定は {autoDetectedSeasonLabelJa(current)} です。</p>
      ) : (
        <p className="season-context-note">
          {currentSeasonLabelJa(current)} ではなく、{selectedSeasonLabelJa(display)} を表示しています。
        </p>
      )}

      <div className="season-context-fields" role="group" aria-label="年とクール">
        <label className="field">
          <span>年</span>
          <select
            aria-label="年"
            value={display.year}
            disabled={disabled}
            onChange={(event) => {
              const year = Number(event.target.value);
              if (pendingYearScopeRef.current ?? displayYearScope) {
                commitYearScope(year);
                return;
              }
              commit(mergeSeasonPatch(liveCanonical(), { year }));
            }}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year === current.year ? `${year}年（現在の年）` : `${year}年`}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>クール</span>
          <select
            aria-label="クール"
            value={displayYearScope ? "ALL" : display.season}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "ALL") {
                commitYearScope(liveCanonical().year);
                return;
              }
              commit(
                mergeSeasonPatch(liveCanonical(), {
                  season: next as SeasonRef["season"]
                })
              );
            }}
          >
            {allowYearScope ? <option value="ALL">全年</option> : null}
            {ANIME_SEASONS.map((season) => {
              const optionRef = { year: display.year, season };
              const currentMark = equalSeasonRef(optionRef, current)
                ? "（今期）"
                : "";
              return (
                <option key={season} value={season}>
                  {SEASON_NAME_JA[season]}
                  {currentMark}
                </option>
              );
            })}
          </select>
        </label>

        <div className="season-context-adjacent">
          <button
            type="button"
            className="command-button"
            aria-label={`前の期（${seasonHeadingJa(previousSeason(display))}）`}
            disabled={disabled || displayYearScope}
            onClick={() => commit(previousSeason(liveCanonical()))}
          >
            前の期
          </button>
          <button
            type="button"
            className="command-button"
            aria-label={`次の期（${seasonHeadingJa(nextSeason(display))}）`}
            disabled={disabled || displayYearScope}
            onClick={() => commit(nextSeason(liveCanonical()))}
          >
            次の期
          </button>
        </div>
      </div>
    </div>
  );
}
