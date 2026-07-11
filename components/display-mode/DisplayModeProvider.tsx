"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type DisplayMode = "visual" | "simple";

export const DISPLAY_MODE_STORAGE_KEY = "numanie-display-mode";
export const DEFAULT_DISPLAY_MODE: DisplayMode = "visual";

type DisplayModeContextValue = {
  mode: DisplayMode;
  setMode: (mode: DisplayMode) => void;
  /** True after client has read localStorage (avoids treating SSR default as user choice). */
  hydrated: boolean;
};

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

function isDisplayMode(value: string | null): value is DisplayMode {
  return value === "visual" || value === "simple";
}

export function DisplayModeProvider({ children }: { children: ReactNode }) {
  // Always start with the default so SSR and the first client render match.
  const [mode, setModeState] = useState<DisplayMode>(DEFAULT_DISPLAY_MODE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
      if (isDisplayMode(stored)) {
        setModeState(stored);
      }
    } catch {
      // Private mode / SecurityError — keep default mode.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.displayMode = mode;
  }, [mode, hydrated]);

  const setMode = useCallback((next: DisplayMode) => {
    setModeState(next);
    try {
      localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, next);
    } catch {
      // Private mode / quota — keep in-memory mode only.
    }
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, hydrated }),
    [mode, setMode, hydrated]
  );

  return (
    <DisplayModeContext.Provider value={value}>{children}</DisplayModeContext.Provider>
  );
}

export function useDisplayMode(): DisplayModeContextValue {
  const ctx = useContext(DisplayModeContext);
  if (!ctx) {
    throw new Error("useDisplayMode must be used within DisplayModeProvider");
  }
  return ctx;
}
