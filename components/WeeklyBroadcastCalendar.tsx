"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import CardLane, { type LaneCardData } from "@/components/CardLane";
import {
  BROADCAST_WEEKDAYS,
  getTodayBroadcastWeekday,
  type BroadcastEntry,
  type BroadcastWeekday
} from "@/lib/broadcast-calendar";
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

type WeeklyBroadcastCalendarProps = {
  /** 曜日ごとにグルーピング済みの視聴記録（放送中/これから放送のエントリ） */
  grouped: Record<BroadcastWeekday, BroadcastEntry[]>;
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
  const today = getTodayBroadcastWeekday();
  const todayLaneRef = useRef<HTMLDivElement>(null);
  const [showInfo, setShowInfo] = useState(false);

  // アイテムがある曜日だけ表示（アイテムゼロの日は非表示）
  const activeDays = BROADCAST_WEEKDAYS.filter((day) => grouped[day].length > 0);

  useEffect(() => {
    todayLaneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  function toCardData(entry: BroadcastEntry): LaneCardData {
    const { record } = entry;
    const anime = record.anime as AnimeItem;
    const provider = anime.streamingProvidersJp?.flatrate?.[0] ?? null;
    return {
      id: record.animeId,
      title: anime.title,
      coverImage: anime.proxiedImageUrl ?? anime.imageUrl ?? null,
      providerLogoUrl: provider?.logoUrl ?? null,
      providerName: provider?.name ?? null,
      statusVariant: record.status === "watching" ? "watching" : "planned",
      dimmed: entry.state === "upcoming",
      noteLabel: entry.state === "upcoming" && entry.startLabel ? `${entry.startLabel}〜` : null
    };
  }

  if (activeDays.length === 0) return null;

  return (
    <section
      className={["watchlist-broadcast-lanes", className].filter(Boolean).join(" ")}
      aria-label={heading}
    >
      <div className="broadcast-lanes-heading-row">
        <h2 className="watchlist-broadcast-lanes-heading">{heading}</h2>
        <button
          type="button"
          className="broadcast-lanes-info-toggle"
          aria-label="放映カレンダーの表示ルール"
          aria-expanded={showInfo}
          aria-controls="broadcast-lanes-info-text"
          onClick={() => setShowInfo((value) => !value)}
        >
          <Info size={16} aria-hidden="true" />
        </button>
      </div>
      {showInfo ? (
        <p id="broadcast-lanes-info-text" className="broadcast-lanes-info-text" role="note">
          「視聴中」「見たい」に登録した作品を放送曜日ごとに表示しています。放送中（次回放送が約1週間以内）の作品が先頭、まだ放送が先の作品は薄め＋放送開始日（例: 4/10〜）でその後に並びます。放送スケジュールは最新の情報に自動更新され、今日の曜日は🔴で示しています。
        </p>
      ) : null}
      <div className="watchlist-broadcast-lanes-list">
        {activeDays.map((day) => (
          <div key={day} ref={day === today ? todayLaneRef : undefined}>
            <CardLane
              heading={`${DAY_LABELS[day]}${day === today ? " 🔴（本日）" : ""}`}
              count={grouped[day].length}
              items={grouped[day].map(toCardData)}
              className={day === today ? "card-lane--today" : undefined}
              onCardClick={
                onItemClick
                  ? (card) => {
                      const entry = grouped[day].find((e) => e.record.animeId === card.id);
                      if (entry) onItemClick(entry.record);
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
