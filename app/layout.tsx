import type { Metadata, Viewport } from "next";
import { Providers } from "@/app/providers";
import { GlobalNav } from "@/components/GlobalNav";
import { MobileNav } from "@/components/MobileNav";
import { WelcomeModal } from "@/components/WelcomeModal";
import { SWRegister } from "@/app/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "numanie",
  description: "アニメ視聴を自分のものに。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "numanie",
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
  themeColor: "#6366f1",
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
