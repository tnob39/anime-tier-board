"use client";

import Image from "next/image";
import AnimeCardPlaceholder from "./AnimeCardPlaceholder";

/**
 * 縦リスト1行のデータ。CardLane の LaneCardData とは独立に定義し、
 * ホームのモード別レイアウト（進捗・配信・メモ抜粋など）で拡張しやすくしている。
 * 構造的に LaneCardData と後方互換（meta が増えただけ）。
 */
export type AnimeListItem = {
  id: number | string;
  title: string;
  coverImage?: string | null;
  status?: string | null;
  statusVariant?: "watching" | "completed" | "planned" | "dropped" | "default";
  /** 行の補足表示（例: "#7 配信中" / "dアニメで見放題" / "月 24:00"）*/
  meta?: string | null;
};

const STATUS_LABEL: Record<NonNullable<AnimeListItem["statusVariant"]>, string> = {
  watching: "視聴中",
  completed: "視聴済",
  planned: "見たい",
  dropped: "中断",
  default: "",
};

function StatusBadge({ item }: { item: AnimeListItem }) {
  const variant = item.statusVariant ?? "default";
  const label = item.status ?? STATUS_LABEL[variant];
  if (!label) return null;
  return <span className={`anime-row-badge anime-row-badge--${variant}`}>{label}</span>;
}

export type AnimeListProps = {
  /** セクション見出し */
  heading: string;
  /** 件数ラベル（省略可）*/
  count?: number;
  /** リストデータ配列 */
  items: AnimeListItem[];
  /** 行クリック時コールバック（省略可）*/
  onItemClick?: (item: AnimeListItem) => void;
  /** 追加の className（セクション全体に適用）*/
  className?: string;
};

/**
 * 縦積みのアニメリスト。CardLane（横スクロール）の縦版。
 * 参考アプリ準拠: ポスター + タイトル + 右ステータスの 1 行レイアウト。
 */
export default function AnimeList({
  heading,
  count,
  items,
  onItemClick,
  className,
}: AnimeListProps) {
  if (items.length === 0) return null;

  return (
    <section className={["anime-list-section", className].filter(Boolean).join(" ")}>
      <div className="anime-list-header">
        <h2 className="anime-list-heading">{heading}</h2>
        {count != null && <span className="anime-list-count">{count}</span>}
      </div>
      <ul className="anime-list" role="list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              className="anime-row"
              onClick={() => onItemClick?.(item)}
              aria-label={item.title}
              type="button"
            >
              <div className="anime-row-poster">
                {item.coverImage ? (
                  <Image
                    src={item.coverImage}
                    alt={item.title}
                    width={48}
                    height={64}
                    className="anime-row-img"
                    unoptimized
                  />
                ) : (
                  <AnimeCardPlaceholder title={item.title} className="anime-row-placeholder" />
                )}
              </div>
              <div className="anime-row-body">
                <p className="anime-row-title">{item.title}</p>
                {item.meta ? <p className="anime-row-meta">{item.meta}</p> : null}
              </div>
              <StatusBadge item={item} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
