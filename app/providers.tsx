"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { UiModeProvider } from "@/lib/ui-mode";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <UiModeProvider>{children}</UiModeProvider>
    </SessionProvider>
  );
}
