"use client";

import {
  Check,
  Monitor,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme, type ThemePref } from "@/lib/theme";

const themeOptions: { pref: ThemePref; label: string; icon: LucideIcon }[] = [
  { pref: "light", label: "ライト", icon: Sun },
  { pref: "dark", label: "ダーク", icon: Moon },
  { pref: "system", label: "システム", icon: Monitor }
];

export function ThemeSwitch() {
  const [themePref, setThemePref] = useTheme();

  return (
    <div className="theme-switch" role="radiogroup" aria-label="テーマ">
      {themeOptions.map((opt) => {
        const Icon = opt.icon;
        const active = themePref === opt.pref;
        return (
          <button
            key={opt.pref}
            type="button"
            role="radio"
            aria-checked={active}
            className={active ? "theme-switch-btn is-active" : "theme-switch-btn"}
            onClick={() => setThemePref(opt.pref)}
          >
            <Icon size={16} className="theme-switch-icon" aria-hidden="true" />
            <span>{opt.label}</span>
            {active && <Check size={15} className="theme-switch-check" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
