"use client";

import type { ReactNode } from "react";
import { ImpressionArtwork } from "@/components/ImpressionSnapshotView";
import { seasonHeadingJa } from "@/lib/season";
import { IMPRESSION_RATING_LABELS, type ImpressionAnime, type ImpressionSeason, type SeasonImpression } from "@/lib/season-impressions-model";
import { sortImpressionRecords } from "@/lib/season-impressions-view";

export function ImpressionSeasonCard({ seasonKey, records, ready, savedId, onEdit, children }: {
  seasonKey: ImpressionSeason; records: SeasonImpression[]; ready: boolean; savedId: string | null;
  onEdit: (anime: ImpressionAnime) => void; children: ReactNode;
}) {
  return <section aria-labelledby="impressions-personal-title" className="impressions-personal">
    <h2 id="impressions-personal-title">{seasonHeadingJa(seasonKey)}、いまのわたし</h2>
    <p>{ready ? `${records.length}作品を記録` : "保存済みの記録を確認してください。"}</p>
    {ready && !records.length && <p>まず、見た作品から一言。</p>}
    <ul className="impressions-list">
      {sortImpressionRecords(records).map((record) => <li key={record.anime.id} data-just-saved={record.anime.id === savedId || undefined}>
        <button type="button" className="impressions-card impressions-card--checked" disabled={!ready} onClick={() => onEdit(record.anime)}>
          <ImpressionArtwork anime={record.anime} />
          <span className="impressions-card-text"><strong>{record.anime.title}</strong>
            {record.note && <span className="impressions-note">{record.note}</span>}
            {record.rating && <span>今の印象：{IMPRESSION_RATING_LABELS[record.rating]}</span>}
            <span>記録済み・編集</span>
          </span>
        </button>
      </li>)}
    </ul>
    {children}
  </section>;
}
