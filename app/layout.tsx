import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "今期アニメ Tier 表",
  description: "AniList APIから今期アニメを取得してTier表を作るローカルWebアプリ"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
