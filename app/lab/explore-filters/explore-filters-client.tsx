"use client";

import { useMemo, useState } from "react";
import { DisplayModeToggle } from "@/components/display-mode/DisplayModeToggle";
import { CULTURE_CYCLE_CHECKS } from "./culture-cycle.ts";
import { EXPLORE_FILTER_FIXTURES } from "./fixture.ts";
import {
  DEFAULT_FILTERS,
  PRIMARY_WATCH_ACTION_LABEL,
  UNAVAILABLE_WATCH_LABEL,
  availabilityLabelJa,
  decisionLabelJa,
  decadeOf,
  filterExploreItems,
  formatConfirmedAtJa,
  isLegallyWatchable,
  regionLabelJa,
  resetFilters,
  staffKey,
  staffLabel,
  uniqueDecades,
  uniqueStaff,
  uniqueStudios
} from "./filter.ts";
import type { AvailabilityFilter, ExploreFilters } from "./types.ts";
import "./explore-filters.css";

const AVAILABILITY_OPTIONS: { value: AvailabilityFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "legal", label: "正規視聴できる" },
  { value: "flatrate", label: "見放題" },
  { value: "rent", label: "レンタル" },
  { value: "buy", label: "購入" },
  { value: "unavailable", label: "確認できない" }
];

export function ExploreFiltersClient() {
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const decades = useMemo(() => uniqueDecades(EXPLORE_FILTER_FIXTURES), []);
  const studios = useMemo(() => uniqueStudios(EXPLORE_FILTER_FIXTURES), []);
  const staffOptions = useMemo(() => uniqueStaff(EXPLORE_FILTER_FIXTURES), []);
  const results = useMemo(
    () => filterExploreItems(EXPLORE_FILTER_FIXTURES, filters),
    [filters]
  );
  const selected = results.find((item) => item.id === selectedId) ?? null;

  function updateFilter<K extends keyof ExploreFilters>(key: K, value: ExploreFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setSelectedId(null);
  }

  function handleReset() {
    setFilters(resetFilters());
    setSelectedId(null);
  }

  return (
    <div className="lab-ef-page" data-testid="lab-ef-page">
      <div className="lab-ef-stack">
        <header className="lab-ef-header">
          <p className="lab-ef-kicker">Lab · さがすフィルタ</p>
          <h1>正規視聴できる作品を、年代・スタジオ・スタッフからさがす</h1>
          <p>
            本番の「さがす」とは独立したフィクスチャ検証です。許可済みソースだけを正規視聴先にし、不明・許諾が必要な情報は確認できないと表示します。
          </p>
          <p>
            動かす指標は Creator Discovery Rate と Rediscovery Rate です。選択した作品の次の一手は正規視聴の1つだけです。
          </p>
          <div className="lab-ef-toolbar">
            <DisplayModeToggle className="lab-ef-mode" />
          </div>
        </header>

        <form
          className="lab-ef-filters"
          aria-labelledby="lab-ef-filters-heading"
          onSubmit={(event) => event.preventDefault()}
        >
          <h2 id="lab-ef-filters-heading">絞り込み</h2>
          <div className="lab-ef-filter-grid">
            <label className="lab-ef-field">
              <span>正規視聴</span>
              <select
                className="lab-ef-select"
                value={filters.availability}
                onChange={(event) =>
                  updateFilter("availability", event.target.value as AvailabilityFilter)
                }
              >
                {AVAILABILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="lab-ef-field">
              <span>年代</span>
              <select
                className="lab-ef-select"
                value={filters.decade}
                onChange={(event) => updateFilter("decade", event.target.value)}
              >
                <option value="all">すべての年代</option>
                {decades.map((decade) => (
                  <option key={decade} value={decade}>
                    {decade.replace("s", "")}年代
                  </option>
                ))}
              </select>
            </label>
            <label className="lab-ef-field">
              <span>スタジオ</span>
              <select
                className="lab-ef-select"
                value={filters.studio}
                onChange={(event) => updateFilter("studio", event.target.value)}
              >
                <option value="all">すべてのスタジオ</option>
                {studios.map((studio) => (
                  <option key={studio} value={studio}>
                    {studio}
                  </option>
                ))}
              </select>
            </label>
            <label className="lab-ef-field">
              <span>スタッフ</span>
              <select
                className="lab-ef-select"
                value={filters.staff}
                onChange={(event) => updateFilter("staff", event.target.value)}
              >
                <option value="all">すべてのスタッフ</option>
                {staffOptions.map((entry) => (
                  <option key={staffKey(entry)} value={staffKey(entry)}>
                    {staffLabel(entry)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="lab-ef-actions">
            <button className="lab-ef-reset" type="button" onClick={handleReset}>
              条件をリセット
            </button>
          </div>
        </form>

        <div className="lab-ef-layout">
          {results.length > 0 ? (
            <section className="lab-ef-results" aria-labelledby="lab-ef-results-heading">
              <h2 id="lab-ef-results-heading">結果 {results.length}件</h2>
              <ul className="lab-ef-list">
                {results.map((item) => {
                  const watchable = isLegallyWatchable(item);
                  const selectedNow = selected?.id === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={selectedNow ? "lab-ef-result is-selected" : "lab-ef-result"}
                        aria-pressed={selectedNow}
                        data-testid="lab-ef-result"
                        data-item-id={item.id}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="lab-ef-result-row">
                          <span className="lab-ef-poster" aria-hidden="true">
                            {item.titleJa.replace("ATB-764 ", "").slice(0, 1)}
                          </span>
                          <span className="lab-ef-result-main">
                            <span className="lab-ef-result-title">{item.titleJa}</span>
                            <span className="lab-ef-secondary">{item.titleRomaji}</span>
                            <span className="lab-ef-meta">
                              {item.year}年 · {item.studio.nameJa} · {staffLabel(item.staff[0])}
                            </span>
                          </span>
                          <span
                            className={watchable ? "lab-ef-badge is-legal" : "lab-ef-badge is-blocked"}
                          >
                            {watchable ? availabilityLabelJa(item.availability) : "確認できない"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <section className="lab-ef-empty" data-testid="lab-ef-empty" aria-live="polite">
              <h2>結果 0件</h2>
              <p>条件に一致する作品がありません。条件をリセットすると、すべてのフィクスチャが戻ります。</p>
              <button className="lab-ef-reset" type="button" onClick={handleReset}>
                条件をリセット
              </button>
            </section>
          )}

          <section className="lab-ef-detail" aria-labelledby="lab-ef-detail-heading">
            <h2 id="lab-ef-detail-heading">選んだ作品</h2>
            {selected ? (
              <div className="lab-ef-detail-body" data-testid="lab-ef-detail">
                <h3>{selected.titleJa}</h3>
                <p className="lab-ef-secondary">{selected.titleRomaji}</p>
                <dl className="lab-ef-credits">
                  <dt>年代</dt>
                  <dd>
                    {selected.year}年（{decadeOf(selected.year).replace("s", "")}年代）
                  </dd>
                  <dt>スタジオ</dt>
                  <dd>
                    {selected.studio.nameJa}
                    <span className="lab-ef-secondary"> {selected.studio.nameRomaji}</span>
                  </dd>
                  <dt>スタッフ</dt>
                  <dd>
                    {selected.staff.map((entry) => (
                      <div key={staffKey(entry)}>
                        {staffLabel(entry)}
                        <span className="lab-ef-secondary">
                          {" "}
                          {entry.roleRomaji} {entry.nameRomaji}
                        </span>
                      </div>
                    ))}
                  </dd>
                </dl>
                <dl className="lab-ef-provenance" data-testid="lab-ef-provenance">
                  <dt>出典</dt>
                  <dd>{selected.source.labelJa}</dd>
                  <dt>判定</dt>
                  <dd>{decisionLabelJa(selected.source.decision)}</dd>
                  <dt>対象地域</dt>
                  <dd>{regionLabelJa(selected.region)}</dd>
                  <dt>視聴形態</dt>
                  <dd>
                    {isLegallyWatchable(selected)
                      ? availabilityLabelJa(selected.availability)
                      : "確認できない"}
                  </dd>
                  <dt>確認日時</dt>
                  <dd>{formatConfirmedAtJa(selected.source.confirmedAt) ?? "確認できない"}</dd>
                  <dt>根拠</dt>
                  <dd>{selected.source.evidence}</dd>
                </dl>
                {isLegallyWatchable(selected) && selected.source.watchUrl ? (
                  <a
                    className="lab-ef-primary"
                    href={selected.source.watchUrl}
                    data-testid="lab-ef-primary-action"
                  >
                    {PRIMARY_WATCH_ACTION_LABEL}
                  </a>
                ) : (
                  <p
                    className="lab-ef-unavailable"
                    role="status"
                    data-testid="lab-ef-unavailable"
                  >
                    {UNAVAILABLE_WATCH_LABEL}
                  </p>
                )}
              </div>
            ) : (
              <p className="lab-ef-note">結果から作品を選ぶと、正規視聴の次の一手だけを表示します。</p>
            )}
          </section>
        </div>

        <section
          className="lab-ef-cycle"
          aria-labelledby="lab-ef-cycle-heading"
          data-testid="lab-ef-culture-cycle"
        >
          <h2 id="lab-ef-cycle-heading">文化循環チェック</h2>
          <p>UX_DIRECTION.md §1.8 の記録。このLabの範囲だけを記入しています。</p>
          <ul className="lab-ef-cycle-list">
            {CULTURE_CYCLE_CHECKS.map((check) => (
              <li key={check.id} className="lab-ef-cycle-item">
                <span className="lab-ef-cycle-label">
                  {check.label} · {check.result}
                </span>
                <span className="lab-ef-secondary">{check.note}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
