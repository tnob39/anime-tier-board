"use client";

import { useEffect, useRef } from "react";
import CardLane, { type LaneCardData } from "@/components/CardLane";
import { BROADCAST_WEEKDAYS, type BroadcastWeekday } from "@/lib/broadcast-calendar";
import type { AnimeStatusRecord } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

// 月〜日の表示ラベル
const DAY_LABELS: Record<BroadcastWeekday, string> = {
  月: "月曜",
  火: "火曜",
  水: "水曜",
  木: "木曜",
  金: "金曜",
  土: "土曜",
  日: "日曜"
};

// Date#getDay()（0=日）→ 日本語1文字
const WEEKDAY_BY_INDEX = ["日", "月", "火", "水", "木", "金", "土"] as const;

type WeeklyBroadcastCalendarProps = {
  /** 曜日ごとにグルーピング済みの視聴記録 */
  grouped: Record<BroadcastWeekday, AnimeStatusRecord[]>;
  /** カードタップ時のコールバック（省略時はカードは非遷移） */
  onItemClick?: (record: AnimeStatusRecord) => void;
  /** ルートセクションへの追加 className */
  className?: string;
  /** 見出し（既定: 今週の放映カレンダー） */
  heading?: string;
};

/**
 * 曜日別の放映カレンダー（表示専用）。
 * アイテムのある曜日だけを月→日順の横スクロールレーンで描画し、
 * 今日の曜日レーンをハイライト＋初回マウント時に自動スクロールする。
 * グルーピングは `lib/broadcast-calendar` の `groupItemsByBroadcastDay` に分離。
 */
export function WeeklyBroadcastCalendar({
  grouped,
  onItemClick,
  className,
  heading = "今週の放映カレンダー"
}: WeeklyBroadcastCalendarProps) {
  const today = WEEKDAY_BY_INDEX[new Date().getDay()] as BroadcastWeekday;
  const todayLaneRef = useRef<HTMLDivElement>(null);

  // アイテムがある曜日だけ表示（アイテムゼロの日は非表示）
  const activeDays = BROADCAST_WEEKDAYS.filter((day) => grouped[day].length > 0);

  useEffect(() => {
    todayLaneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  function toCardData(record: AnimeStatusRecord): LaneCardData {
    const anime = record.anime as AnimeItem;
    return {
      id: record.animeId,
      title: anime.title,
      coverImage: anime.proxiedImageUrl ?? anime.imageUrl ?? null,
      statusVariant: record.status === "watching" ? "watching" : "planned"
    };
  }

  if (activeDays.length === 0) return null;

  return (
    <section
      className={["watchlist-broadcast-lanes", className].filter(Boolean).join(" ")}
      aria-label={heading}
    >
      <h2 className="watchlist-broadcast-lanes-heading">{heading}</h2>
      <div className="watchlist-broadcast-lanes-list">
        {activeDays.map((day) => (
          <div key={day} ref={day === today ? todayLaneRef : undefined}>
            <CardLane
              heading={`${DAY_LABELS[day]}${day === today ? " 🔴" : ""}`}
              count={grouped[day].length}
              items={grouped[day].map(toCardData)}
              className={day === today ? "card-lane--today" : undefined}
              onCardClick={
                onItemClick
                  ? (card) => {
                      const record = grouped[day].find((r) => r.animeId === card.id);
                      if (record) onItemClick(record);
                    }
                  : undefined
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
