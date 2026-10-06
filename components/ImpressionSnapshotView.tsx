"use client";

import Image from "next/image";
import { useState } from "react";
import { useDisplayMode } from "@/components/display-mode/DisplayModeProvider";
import { IMPRESSION_RATING_LABELS, type ImpressionAnime, type ImpressionSnapshot } from "@/lib/season-impressions-model";
import { seasonHeadingJa } from "@/lib/season";

export function ImpressionArtwork({ anime }: { anime: ImpressionAnime }) {
  const { hydrated, mode } = useDisplayMode();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!hydrated || mode === "simple" || !anime.imageUrl || failedUrl === anime.imageUrl) return null;
  return <Image className="impressions-artwork" src={`/api/image-proxy?url=${encodeURIComponent(anime.imageUrl)}`} alt="" width={64} height={90} unoptimized
    onError={() => setFailedUrl(anime.imageUrl)} />;
}

export function ImpressionCardContent({ anime, note, rating, status }: {
  anime: ImpressionAnime;
  note?: string | null;
  rating?: keyof typeof IMPRESSION_RATING_LABELS | null;
  status?: string;
}) {
  return <>
    <ImpressionArtwork anime={anime} />
    <span className="impressions-card-text">
      <strong>{anime.title}</strong>
      {note && <span className="impressions-note">{note}</span>}
      {rating && <span className="impressions-meta">今の印象：{IMPRESSION_RATING_LABELS[rating]}</span>}
      {status && <span className="impressions-meta">{status}</span>}
    </span>
  </>;
}

export function ImpressionSnapshotView({ snapshot, publishedAt }: { snapshot: ImpressionSnapshot; publishedAt?: string }) {
  return <section className="impressions-public-card" aria-label="共有カード">
    <p className="impressions-public-title">{seasonHeadingJa(snapshot)}、いまのわたし</p>
    <p className="impressions-meta">{publishedAt ? <><time dateTime={publishedAt}>{new Date(publishedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</time> 公開</> : "公開日：公開時に記録されます"}</p>
    <ul className="impressions-list">
    {snapshot.items.map((item) => <li className="impressions-card impressions-card--checked" key={item.anime.id}>
      <ImpressionCardContent anime={item.anime} note={item.note} rating={item.rating} />
    </li>)}
  </ul></section>;
}
