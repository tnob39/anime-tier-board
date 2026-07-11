"use client";

import { DisplayModeProvider } from "@/components/display-mode/DisplayModeProvider";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <DisplayModeProvider>{children}</DisplayModeProvider>
    </SessionProvider>
  );
}
