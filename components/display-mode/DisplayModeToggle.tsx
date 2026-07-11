"use client";

import { useDisplayMode, type DisplayMode } from "./DisplayModeProvider";
import "./display-mode.css";

const OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "visual", label: "Visual" },
  { value: "simple", label: "Simple" }
];

type DisplayModeToggleProps = {
  className?: string;
  /** Accessible name for the control group. */
  label?: string;
};

export function DisplayModeToggle({
  className,
  label = "表示モード"
}: DisplayModeToggleProps) {
  const { mode, setMode } = useDisplayMode();

  return (
    <div
      className={["display-mode-toggle", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
    >
      {OPTIONS.map((option) => {
        const pressed = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={
              pressed
                ? "display-mode-toggle__btn display-mode-toggle__btn--active"
                : "display-mode-toggle__btn"
            }
            aria-pressed={pressed}
            onClick={() => setMode(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
