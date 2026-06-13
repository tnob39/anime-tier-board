"use client";

import Image from "next/image";
import AnimeCardPlaceholder from "./AnimeCardPlaceholder";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LaneCardData = {
  /** AniList / Jikan の anime id など識別子 */
  id: number | string;
  title: string;
  /** ポスター画像 URL（任意）*/
  coverImage?: string | null;
  /** 視聴ステータスラベル（例: "視聴中" / "視聴済" / "見たい"）*/
  status?: string | null;
  /** ステータスバッジの配色 variant */
  statusVariant?: "watching" | "completed" | "planned" | "dropped" | "default";
};

export type CardLaneProps = {
  /** セクション見出し */
  heading: string;
  /** 件数ラベル（省略可）*/
  count?: number;
  /** カードデータ配列 */
  items: LaneCardData[];
  /** カードクリック時コールバック（省略可）*/
  onCardClick?: (item: LaneCardData) => void;
  /** 追加の className（レーン全体ラッパーに適用）*/
  className?: string;
};

// ─── Status badge helpers ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<NonNullable<LaneCardData["statusVariant"]>, string> =
  {
    watching: "視聴中",
    completed: "視聴済",
    planned: "見たい",
    dropped: "中断",
    default: "",
  };

function StatusBadge({
  status,
  variant = "default",
}: {
  status?: string | null;
  variant?: LaneCardData["statusVariant"];
}) {
  const label = status ?? (variant ? STATUS_LABEL[variant] : "");
  if (!label) return null;
  return <span className={`lane-card-badge lane-card-badge--${variant ?? "default"}`}>{label}</span>;
}

// ─── LaneCard ─────────────────────────────────────────────────────────────────

function LaneCard({
  item,
  onClick,
}: {
  item: LaneCardData;
  onClick?: (item: LaneCardData) => void;
}) {
  return (
    <button
      className="lane-card"
      onClick={() => onClick?.(item)}
      aria-label={item.title}
      type="button"
    >
      <div className="lane-card-poster">
        {item.coverImage ? (
          <Image
            src={item.coverImage}
            alt={item.title}
            width={96}
            height={136}
            className="lane-card-img"
            unoptimized
          />
        ) : (
          <AnimeCardPlaceholder title={item.title} className="lane-card-placeholder" />
        )}
      </div>
      <div className="lane-card-body">
        <p className="lane-card-title">{item.title}</p>
        <StatusBadge status={item.status} variant={item.statusVariant} />
      </div>
    </button>
  );
}

// ─── CardLane ────────────────────────────────────────────────────────────────

export default function CardLane({
  heading,
  count,
  items,
  onCardClick,
  className,
}: CardLaneProps) {
  return (
    <section className={["card-lane", className].filter(Boolean).join(" ")}>
      <div className="card-lane-header">
        <h2 className="card-lane-heading">{heading}</h2>
        {count != null && (
          <span className="card-lane-count">{count}</span>
        )}
      </div>

      <div className="card-lane-scroll-wrap">
        {/* 左フェード */}
        <div className="card-lane-fade card-lane-fade--left" aria-hidden />
        {/* 右フェード */}
        <div className="card-lane-fade card-lane-fade--right" aria-hidden />

        <ul className="card-lane-list" role="list">
          {items.map((item) => (
            <li key={item.id} className="card-lane-item">
              <LaneCard item={item} onClick={onCardClick} />
            </li>
          ))}
          {items.length === 0 && (
            <li className="card-lane-empty">表示できる作品がありません</li>
          )}
        </ul>
      </div>
    </section>
  );
}
