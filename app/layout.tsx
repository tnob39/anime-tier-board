import type { Metadata, Viewport } from "next";
import { Providers } from "@/app/providers";
import { AppShell } from "@/components/AppShell";
import { SWRegister } from "@/app/sw-register";
import "./globals.css";
import "./motion-standards.css";

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
      <head>
        {/* 初回ペイント前にテーマを適用してFOUC（ライト→ダークのちらつき）を防ぐ。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("numanie:theme")||"light";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          メインコンテンツへスキップ
        </a>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <SWRegister />
      </body>
    </html>
  );
}
