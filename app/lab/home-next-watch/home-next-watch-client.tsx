"use client";

import { useCallback, useEffect, useState } from "react";
import { useDisplayMode, type DisplayMode } from "@/components/display-mode/DisplayModeProvider";
import { CULTURE_CYCLE_CHECKS } from "./culture-check";
import {
  getCandidate,
  isEligibleWatchCta,
  LAB_CANDIDATES,
  type LabFixtureId
} from "./fixtures";
import "./home-next-watch.css";

const MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "visual", label: "Visual" },
  { value: "simple", label: "Simple" }
];

type HomeNextWatchLabProps = {
  initialFixture: LabFixtureId;
};

export function HomeNextWatchLab({ initialFixture }: HomeNextWatchLabProps) {
  const { mode, setMode, hydrated } = useDisplayMode();
  const [selectedId, setSelectedId] = useState<LabFixtureId>(initialFixture);
  const candidate = getCandidate(selectedId);
  const showImage = hydrated && mode === "visual" && Boolean(candidate.imageUrl);
  const canWatch = isEligibleWatchCta(candidate);

  const selectCandidate = useCallback((id: LabFixtureId) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("fixture", id);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, []);

  useEffect(() => {
    setSelectedId(initialFixture);
  }, [initialFixture]);

  return (
    <div
      className="hnw"
      data-hnw-root="true"
      data-hnw-fixture={selectedId}
      data-hnw-availability={candidate.availability}
      data-hnw-cta-eligible={canWatch ? "true" : "false"}
      data-hnw-mode={hydrated ? mode : "visual"}
    >
      <header className="hnw-header">
        <p className="hnw-kicker">Lab フィクスチャ</p>
        <h1 className="hnw-title" id="hnw-title">
          今夜の1本
        </h1>
        <p className="hnw-lead">
          今夜見る作品を1つ選び、確認済みなら日本向けの正規配信へ進みます。未確認の視聴先は出しません。
        </p>
      </header>

      <div className="hnw-mode" role="group" aria-label="表示モード">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="hnw-mode-btn"
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <fieldset className="hnw-candidates">
        <legend className="hnw-candidates-legend">今夜見る作品</legend>
        {LAB_CANDIDATES.map((item) => (
          <label key={item.id} className="hnw-candidate">
            <input
              className="hnw-candidate-input"
              type="radio"
              name="hnw-tonight"
              value={item.id}
              checked={selectedId === item.id}
              onChange={() => selectCandidate(item.id)}
            />
            <span className="hnw-candidate-copy">
              <span className="hnw-candidate-title">{item.titleJa}</span>
              <span className="hnw-candidate-studio">{item.studioLabel}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <section className="hnw-panel" aria-labelledby="hnw-next-heading" data-hnw-next="true">
        <h2 className="hnw-panel-heading" id="hnw-next-heading">
          次の一手
        </h2>
        {showImage && candidate.imageUrl ? (
          <img className="hnw-art" src={candidate.imageUrl} alt="" aria-hidden="true" />
        ) : null}
        <p className="hnw-reason">{candidate.reasonLabel}</p>
        <dl className="hnw-provenance" data-hnw-provenance="true">
          <dt>出典</dt>
          <dd data-hnw-source="true">{candidate.source}</dd>
          <dt>地域</dt>
          <dd data-hnw-region="true">{candidate.regionLabel}</dd>
          <dt>確認日時</dt>
          <dd data-hnw-checked-at="true">{candidate.checkedAtLabel}</dd>
          <dt>作り手</dt>
          <dd data-hnw-studio="true">{candidate.studioLabel}</dd>
        </dl>
        {canWatch ? (
          <a
            className="hnw-primary-cta"
            data-hnw-watch-link="true"
            href={candidate.destinationHref}
          >
            {candidate.serviceName} で見る
          </a>
        ) : (
          <p className="hnw-unavailable" data-hnw-unavailable="true">
            正規の視聴先は未確認です。リンクは表示しません。
          </p>
        )}
      </section>

      <section
        className="hnw-culture"
        aria-labelledby="hnw-culture-title"
        data-hnw-culture-check="true"
      >
        <h2 className="hnw-culture-title" id="hnw-culture-title">
          文化循環チェック
        </h2>
        <ul className="hnw-culture-list">
          {CULTURE_CYCLE_CHECKS.map((item) => (
            <li
              key={item.id}
              className="hnw-culture-item"
              data-hnw-check={item.id}
              data-hnw-check-result={item.result}
            >
              <div className="hnw-culture-row">
                <span className="hnw-culture-label">{item.label}</span>
                <span className="hnw-culture-result">
                  {item.result === "pass" ? "該当" : "N/A"}
                </span>
              </div>
              <p className="hnw-culture-note">{item.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
