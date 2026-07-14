"use client";

import { useState } from "react";
import { shareOrCopyUrl } from "@/lib/share-url";
import type { AnimeSeason } from "@/lib/types";

export type SeasonOption = {
  season: AnimeSeason;
  year: number;
  label: string;
};

export function PromoteClient({
  options,
  defaultKey
}: {
  options: SeasonOption[];
  defaultKey: string;
}) {
  const [selectedKey, setSelectedKey] = useState(defaultKey);
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  async function createShare() {
    const selected = options.find(
      (option) => `${option.year}-${option.season}` === selectedKey
    );
    if (!selected) return;

    setIsCreating(true);
    setMessage("");
    setIsError(false);
    try {
      const response = await fetch("/api/share/season", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: selected.season,
          seasonYear: selected.year
        })
      });
      if (!response.ok) {
        throw new Error("共有リンクを作成できませんでした。");
      }
      const data = (await response.json()) as { shareId: string };
      const url = `${window.location.origin}/share/season/${data.shareId}`;
      setShareUrl(url);
      const outcome = await shareOrCopyUrl({
        url,
        title: `${selected.label} のアニメ`,
        text: "今期のアニメをまとめました。"
      });
      setMessage(
        outcome === "copied"
          ? "共有URLをコピーしました。"
          : outcome === "shared"
            ? "共有しました。"
            : "共有URLを作成しました。"
      );
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "共有リンクを作成できませんでした。"
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="promote-page">
      <section className="promote-panel">
        <p className="season-share-kicker">Lab</p>
        <h1>期まとめを布教</h1>
        <p>共有したい期を選ぶと、その期の最新の視聴状況を共有できます。</p>

        <label htmlFor="promote-season">シーズン</label>
        <select
          id="promote-season"
          value={selectedKey}
          onChange={(event) => {
            setSelectedKey(event.target.value);
            setShareUrl("");
            setMessage("");
            setIsError(false);
          }}
        >
          {options.map((option) => {
            const key = `${option.year}-${option.season}`;
            return (
              <option key={key} value={key}>
                {option.label}
              </option>
            );
          })}
        </select>

        <button
          className="command-button emphasis-button"
          type="button"
          disabled={isCreating}
          onClick={createShare}
        >
          {isCreating ? "作成中…" : "共有リンクを作る"}
        </button>

        {shareUrl ? (
          <a className="promote-url" href={shareUrl}>
            {shareUrl}
          </a>
        ) : null}
        {message ? (
          <p
            className={isError ? "notice error" : "notice success"}
            role={isError ? "alert" : "status"}
            aria-live={isError ? undefined : "polite"}
          >
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
