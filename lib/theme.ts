"use client";

import { useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

export const THEME_KEY = "numanie:theme";

const VALID: readonly ThemePref[] = ["light", "dark", "system"] as const;

// 既定はdark。保存済みのlight/system設定はそのまま尊重する。
export function readThemePref(): ThemePref {
  if (typeof window === "undefined") return "dark";
  const raw = window.localStorage.getItem(THEME_KEY);
  return (VALID as readonly string[]).includes(raw ?? "") ? (raw as ThemePref) : "dark";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** pref を実際の light/dark に解決する。 */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

/** <html data-theme> を更新する。 */
export function applyTheme(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(pref);
}

export function useTheme(): readonly [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>("dark");

  useEffect(() => {
    setPref(readThemePref());
  }, []);

  // pref が "system" の間は OS のテーマ変更に追従する。
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return [
    pref,
    (value: ThemePref) => {
      window.localStorage.setItem(THEME_KEY, value);
      applyTheme(value);
      setPref(value);
    }
  ] as const;
}
