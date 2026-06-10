import type { Metadata, Viewport } from "next";
import { Providers } from "@/app/providers";
import { GlobalNav } from "@/components/GlobalNav";
import { MobileNav } from "@/components/MobileNav";
import { WelcomeModal } from "@/components/WelcomeModal";
import { SWRegister } from "@/app/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "今期アニメ Tier 表",
  description: "AniList APIから今期アニメを取得してTier表を作るWebアプリ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tier Board",
  },
  formatDetection: { telephone: false },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true
    }
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <Providers>
          <GlobalNav />
          {children}
          <MobileNav />
          <WelcomeModal />
        </Providers>
        <SWRegister />
      </body>
    </html>
  );
}
