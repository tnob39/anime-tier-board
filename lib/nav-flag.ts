"use client";

import { useEffect, useState } from "react";

export const NAV_V5_KEY = "numanie:nav-v5";
export const NAV_FLAG_EVENT = "numanie-nav-flag";

export function readNavV5(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NAV_V5_KEY) === "1";
}

export function setNavV5(on: boolean): void {
  window.localStorage.setItem(NAV_V5_KEY, on ? "1" : "0");
  window.dispatchEvent(new Event(NAV_FLAG_EVENT));
}

export function useNavV5(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(readNavV5());
    sync();
    window.addEventListener(NAV_FLAG_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(NAV_FLAG_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return on;
}
