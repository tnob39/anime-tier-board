"use client";

import { useMemo, useState } from "react";
import { useDisplayMode, type DisplayMode } from "@/components/display-mode/DisplayModeProvider";
import {
  DEFAULT_LAB_REGION_ID,
  LAB_CULTURE_CYCLE_ITEMS,
  LAB_POSTER_DATA_URI,
  LAB_REGION_ORDER,
  LAB_REGIONS,
  LAB_SHARE_ANIME,
  type LabRegionId,
} from "./fixtures";
import "./share-region.css";

function formatCheckedAt(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function LabShareRegionClient() {
  const { mode, setMode, hydrated } = useDisplayMode();
  const [regionId, setRegionId] = useState<LabRegionId>(DEFAULT_LAB_REGION_ID);
  const [spoilerOpen, setSpoilerOpen] = useState(false);
  const region = LAB_REGIONS[regionId];
  const checkedAtLabel = useMemo(
    () => formatCheckedAt(region.checkedAt),
    [region.checkedAt]
  );
  const primaryCount = region.availability === "confirmed" ? 1 : 0;

  return (
    <div
      className="lab-share-region"
      data-testid="lab-share-region-page"
      data-hydrated={hydrated ? "true" : "false"}
      data-display-mode={mode}
      data-region={region.region}
      data-availability={region.availability}
      data-primary-count={primaryCount}
    >
      <header className="lab-share-region__banner">
        <p className="lab-share-region__kicker">Lab</p>
        <h1 className="lab-share-region__heading">共有作品の受け取り地域モック</h1>
        <p className="lab-share-region__lede">
          本番の共有ページではありません。fixture
          のみで、受け取り地域の正規視聴・ネタバレ制御・日本語原典と英訳の併記を検証します。
        </p>
      </header>

      <section
        className="lab-share-region__toolbar"
        aria-labelledby="lab-share-region-controls-heading"
        data-testid="lab-share-region-controls"
      >
        <h2 className="lab-share-region__section-title" id="lab-share-region-controls-heading">
          検証コントロール
        </h2>
        <div className="lab-share-region__fields">
          <div className="lab-share-region__field">
            <p className="lab-share-region__label" id="lab-share-region-switch-label">
              受け取り地域を切り替える
            </p>
            <div
              className="lab-share-region__mode"
              role="radiogroup"
              aria-labelledby="lab-share-region-switch-label"
              data-testid="lab-share-region-region-switch"
            >
              {LAB_REGION_ORDER.map((id) => {
                const option = LAB_REGIONS[id];
                const suffix =
                  option.availability === "confirmed" ? "正規配信あり" : "確認できず";
                const selected = regionId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    className="lab-share-region__mode-btn"
                    aria-checked={selected}
                    data-region-id={id}
                    onClick={() => setRegionId(id)}
                  >
                    {option.label}（{suffix}）
                  </button>
                );
              })}
            </div>
          </div>
          <div className="lab-share-region__field">
            <p className="lab-share-region__label" id="lab-share-region-mode-label">
              表示モード
            </p>
            <div
              className="lab-share-region__mode"
              role="group"
              aria-labelledby="lab-share-region-mode-label"
              data-testid="lab-share-region-display-mode"
            >
              <ModeButton mode="visual" current={mode} onSelect={setMode} label="ビジュアル" />
              <ModeButton mode="simple" current={mode} onSelect={setMode} label="シンプル" />
            </div>
          </div>
        </div>
      </section>

      <article
        className="lab-share-region__work"
        aria-labelledby="lab-share-region-canonical-title"
        data-testid="lab-share-region-work"
      >
        {mode === "visual" ? (
          <img
            className="lab-share-region__poster"
            src={LAB_POSTER_DATA_URI}
            alt=""
            width={160}
            height={240}
            data-testid="lab-share-region-poster"
          />
        ) : null}
        <div>
          <div className="lab-share-region__titles">
            <h2
              className="lab-share-region__canonical"
              id="lab-share-region-canonical-title"
              data-testid="lab-share-region-canonical-title"
              lang="ja"
            >
              {LAB_SHARE_ANIME.canonicalTitle}
            </h2>
            <p
              className="lab-share-region__translation"
              data-testid="lab-share-region-translated-title"
              lang="en"
            >
              {LAB_SHARE_ANIME.translatedTitle}
            </p>
          </div>
          <dl className="lab-share-region__meta-list">
            <div>
              <dt>スタジオ</dt>
              <dd data-testid="lab-share-region-studio">{LAB_SHARE_ANIME.studio}</dd>
            </div>
            <div>
              <dt>受け取り地域</dt>
              <dd data-testid="lab-share-region-recipient-region">{region.label}</dd>
            </div>
          </dl>
        </div>
      </article>

      <section
        className="lab-share-region__availability"
        aria-labelledby="lab-share-region-watch-heading"
        data-testid="lab-share-region-availability"
        data-availability={region.availability}
        data-source={region.source}
        data-region={region.region}
        data-checked-at={region.checkedAt}
        role="status"
      >
        <h2 className="lab-share-region__section-title" id="lab-share-region-watch-heading">
          正規視聴
        </h2>
        {region.availability === "confirmed" && region.provider ? (
          <>
            <p className="lab-share-region__lede">
              この地域で確認できた正規配信です。非正規の視聴先は出しません。
            </p>
            <p className="lab-share-region__provenance">
              <span data-testid="lab-share-region-source">出典: {region.source}</span>
              <span data-testid="lab-share-region-region-code">地域: {region.region}</span>
              <span data-testid="lab-share-region-checked-at">
                確認日時: {checkedAtLabel}
              </span>
            </p>
            <div className="lab-share-region__actions">
              <a
                className="lab-share-region__primary"
                data-testid="lab-share-region-watch-cta"
                data-primary-action="watch"
                href={region.provider.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {region.provider.name}で正規視聴する
              </a>
            </div>
          </>
        ) : (
          <>
            <p
              className="lab-share-region__unavailable"
              data-testid="lab-share-region-unavailable"
            >
              この地域では正規配信を確認できません。配信元を推測して表示していません。
            </p>
            <p className="lab-share-region__provenance">
              <span data-testid="lab-share-region-source">出典: {region.source}</span>
              <span data-testid="lab-share-region-region-code">地域: {region.region}</span>
              <span data-testid="lab-share-region-checked-at">
                確認日時: {checkedAtLabel}
              </span>
            </p>
          </>
        )}
      </section>

      <section
        className="lab-share-region__spoiler"
        aria-labelledby="lab-share-region-spoiler-heading"
        data-testid="lab-share-region-spoiler-section"
        data-spoiler-open={spoilerOpen ? "true" : "false"}
      >
        <h2 className="lab-share-region__section-title" id="lab-share-region-spoiler-heading">
          ネタバレ注意
        </h2>
        <p className="lab-share-region__lede">共有メモは既定で隠します。</p>
        <button
          type="button"
          className="lab-share-region__spoiler-toggle"
          data-testid="lab-share-region-spoiler-toggle"
          aria-expanded={spoilerOpen}
          aria-controls="lab-share-region-spoiler-body"
          onClick={() => setSpoilerOpen((open) => !open)}
        >
          {spoilerOpen ? "ネタバレを隠す" : "ネタバレを表示"}
        </button>
        <p
          id="lab-share-region-spoiler-body"
          className="lab-share-region__spoiler-body"
          data-testid="lab-share-region-spoiler"
          hidden={!spoilerOpen}
        >
          {LAB_SHARE_ANIME.spoiler}
        </p>
      </section>

      <section
        className="lab-share-region__cycle"
        aria-labelledby="lab-share-region-cycle-heading"
        data-testid="lab-share-region-culture-cycle"
      >
        <h2 className="lab-share-region__section-title" id="lab-share-region-cycle-heading">
          文化循環チェック
        </h2>
        <ul className="lab-share-region__cycle-list">
          {LAB_CULTURE_CYCLE_ITEMS.map((item) => (
            <li
              key={item.key}
              className="lab-share-region__cycle-item"
              data-cycle={item.key}
            >
              <strong>{item.label}</strong>
              {item.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ModeButton({
  mode,
  current,
  onSelect,
  label,
}: {
  mode: DisplayMode;
  current: DisplayMode;
  onSelect: (mode: DisplayMode) => void;
  label: string;
}) {
  const pressed = current === mode;
  return (
    <button
      type="button"
      className="lab-share-region__mode-btn"
      aria-pressed={pressed}
      data-mode={mode}
      onClick={() => onSelect(mode)}
    >
      {label}
    </button>
  );
}
