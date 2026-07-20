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
  themeColor: "#0f1214",
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* 初回ペイント前に保存テーマを適用し、既定darkのFOUCを防ぐ。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("numanie:theme")||"dark";if(p!=="light"&&p!=="dark"&&p!=="system")p="dark";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}})();`
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
