import type { Metadata } from "next";
import { parseFixtureId } from "./fixtures";
import { HomeNextWatchLab } from "./home-next-watch-client";

export const metadata: Metadata = {
  title: "今夜の1本 Lab — numanie",
  description: "今夜見る1本を選び、日本向けの正規配信へ進むための Lab フィクスチャ",
  robots: { index: false }
};

type PageProps = {
  searchParams: Promise<{ fixture?: string | string[] }>;
};

export default async function HomeNextWatchLabPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialFixture = parseFixtureId(params.fixture);
  return <HomeNextWatchLab initialFixture={initialFixture} />;
}
