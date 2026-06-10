"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UiMode = "simple" | "pro";

const STORAGE_KEY = "anime-tier-board:uiMode";
const DEFAULT_MODE: UiMode = "simple";

type UiModeContextValue = {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
};

const UiModeContext = createContext<UiModeContextValue>({
  mode: DEFAULT_MODE,
  setMode: () => {}
});

export function UiModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UiMode>(DEFAULT_MODE);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pro" || stored === "simple") {
      setModeState(stored);
    }
  }, []);

  function setMode(next: UiMode) {
    setModeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return <UiModeContext.Provider value={{ mode, setMode }}>{children}</UiModeContext.Provider>;
}

export function useUiMode() {
  return useContext(UiModeContext);
}
