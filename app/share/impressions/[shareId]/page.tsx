import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getImpressionShare } from "@/lib/season-impression-shares";
import { SEASON_LABELS } from "@/lib/types";
import { ImpressionSnapshotView } from "@/components/ImpressionSnapshotView";
import { DisplayModeToggle } from "@/components/display-mode/DisplayModeToggle";
import "@/app/tier/impressions/impressions.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "今期チェックの共有 — numanie",
  description: "公開時点のアニメの確認記録と、その時点の印象です。",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  openGraph: { title: "今期チェックの共有", description: "公開時点の確認記録と印象", images: [] }
};

export default async function ImpressionSharePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(shareId)) notFound();
  const share = await getImpressionShare(shareId);
  if (!share) notFound();
  return <div className="impressions-page">
    <h1>{share.year}年{SEASON_LABELS[share.season]} 今期チェック</h1>
    <p>公開時点の確認記録・今の印象です。視聴完了を表すものではありません。</p>
    <p><time dateTime={share.createdAt}>{new Date(share.createdAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</time> 公開</p>
    <DisplayModeToggle />
    <ImpressionSnapshotView snapshot={share} />
    <Link className="impressions-link" href="/tier/impressions">自分の今期チェックをはじめる</Link>
  </div>;
}
