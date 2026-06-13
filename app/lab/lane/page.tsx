/**
 * /lab/lane — CardLane コンポーネント検証ページ (#66)
 *
 * 本番ページを変更せずにダミーデータでレーンの動作を確認するための lab ページ。
 * - watching レーン: ポスター画像あり / ステータスバッジあり
 * - planned レーン: ポスター画像なし（PlaceholderCard）/ 空状態テスト用末尾カード
 */

import type { Metadata } from "next";
import CardLane, { type LaneCardData } from "@/components/CardLane";

export const metadata: Metadata = {
  title: "CardLane Lab — numanie",
  description: "横スクロール・カードレーン コンポーネントの検証ページ",
  robots: { index: false },
};

// ─── ダミーデータ ─────────────────────────────────────────────────────────────

const WATCHING: LaneCardData[] = [
  {
    id: 1,
    title: "葬送のフリーレン",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-KiNF5RPCUQR0.jpg",
    statusVariant: "watching",
  },
  {
    id: 2,
    title: "ダンジョン飯",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153518-oHEMDJJnIiqL.jpg",
    statusVariant: "watching",
  },
  {
    id: 3,
    title: "推しの子 第2期",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx166531-3VnJWDFliKiE.jpg",
    statusVariant: "watching",
  },
  {
    id: 4,
    title: "忘却バッテリー",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170389-GZyivZ7UqCXz.jpg",
    statusVariant: "watching",
  },
  {
    id: 5,
    title: "ひそひそ 〜ささやく間に愛を語れ〜",
    coverImage: null,
    statusVariant: "watching",
  },
  {
    id: 6,
    title: "終末トレインどこへいく?",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170082-CnUJDsPZeXwH.jpg",
    statusVariant: "watching",
  },
];

const PLANNED: LaneCardData[] = [
  {
    id: 11,
    title: "ATRI -My Dear Moments-",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx156803-dSJzwNqmzRLW.jpg",
    statusVariant: "planned",
  },
  {
    id: 12,
    title: "妻、小学生になる。",
    coverImage: null,
    statusVariant: "planned",
  },
  {
    id: 13,
    title: "魔法少女にあこがれて",
    coverImage: null,
    statusVariant: "planned",
  },
  {
    id: 14,
    title: "キングダム 第5シリーズ",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170134-eggLEGkElIhh.jpg",
    statusVariant: "planned",
  },
  {
    id: 15,
    title: "義妹生活",
    coverImage: null,
    statusVariant: "planned",
  },
];

// ─── ページ ───────────────────────────────────────────────────────────────────

export default function LabLanePage() {
  return (
    <div className="lab-lane-page">
      <header className="lab-lane-header">
        <h1 className="lab-lane-title">CardLane Lab</h1>
        <p className="lab-lane-desc">
          横スクロール・カードレーン コンポーネント (#66) の検証ページ。
          スワイプ、スナップ、フェード、プレースホルダーを確認できます。
        </p>
      </header>

      <main className="lab-lane-main">
        {/* レーン 1: 視聴中 — ポスター画像あり */}
        <CardLane
          heading="視聴中"
          count={WATCHING.length}
          items={WATCHING}
        />

        {/* レーン 2: 見たい — 画像なし（Placeholder）を混在 */}
        <CardLane
          heading="見たい"
          count={PLANNED.length}
          items={PLANNED}
        />

        {/* レーン 3: 空状態テスト */}
        <CardLane
          heading="空レーンの例"
          items={[]}
        />
      </main>

      <style>{`
        .lab-lane-page {
          max-width: 640px;
          margin: 0 auto;
          padding: 24px 16px 80px;
          display: grid;
          gap: 0;
        }
        .lab-lane-header {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--surface);
          padding: 18px;
          margin-bottom: 24px;
        }
        .lab-lane-title {
          margin: 0 0 4px;
          font-size: clamp(22px, 4vw, 28px);
        }
        .lab-lane-desc {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.6;
        }
        .lab-lane-main {
          display: grid;
          gap: 32px;
        }
      `}</style>
    </div>
  );
}
