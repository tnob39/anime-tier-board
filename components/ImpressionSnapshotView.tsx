"use client";

import Image from "next/image";
import { useState } from "react";
import { useDisplayMode } from "@/components/display-mode/DisplayModeProvider";
import { IMPRESSION_RATING_LABELS, type ImpressionAnime, type ImpressionSnapshot } from "@/lib/season-impressions-model";

export function ImpressionArtwork({ anime }: { anime: ImpressionAnime }) {
  const { hydrated, mode } = useDisplayMode();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!hydrated || mode === "simple" || !anime.imageUrl || failedUrl === anime.imageUrl) return null;
  return <Image className="impressions-artwork" src={`/api/image-proxy?url=${encodeURIComponent(anime.imageUrl)}`} alt="" width={64} height={90} unoptimized
    onError={() => setFailedUrl(anime.imageUrl)} />;
}

export function ImpressionSnapshotView({ snapshot }: { snapshot: ImpressionSnapshot }) {
  return <ul className="impressions-list">
    {snapshot.items.map((item) => <li className="impressions-card impressions-card--checked" key={item.anime.id}>
      <ImpressionArtwork anime={item.anime} />
      <div className="impressions-card-text">
        <h3>{item.anime.title}</h3>
        <span>✓ 確認済み</span>
        {item.rating !== undefined && <p>今の印象：{item.rating === null ? "評価なし" : IMPRESSION_RATING_LABELS[item.rating]}</p>}
        {item.note !== undefined && <p className="impressions-note">{item.note}</p>}
      </div>
    </li>)}
  </ul>;
}
