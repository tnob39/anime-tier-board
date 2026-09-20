"use client";

import { useEffect, useMemo, useState } from "react";
import { MY_LIST_FIXTURES } from "./fixtures.ts";
import {
  FILTER_LABEL,
  LAB_NOW_ISO,
  LIST_STATE_LABEL,
  classifyWorks,
  equivalentView,
  filterWorks,
  keepWatchingAction,
  primaryActionFor,
  suggestNextWork,
  type ClassifiedWork,
  type DisplayMode,
  type FilterId,
  type PrimaryAction,
  type SavedWork
} from "./model.ts";
import styles from "./my-list-next.module.css";

const NOW = new Date(LAB_NOW_ISO);
const FILTERS: FilterId[] = ["all", "unwatched", "dormant", "expiring"];

type Outcome = "legal-watch" | "keep-watching" | "remove";

function badgeClass(state: ClassifiedWork["state"]): string {
  if (state === "unwatched") return `${styles.badge} ${styles.badgeUnwatched}`;
  if (state === "dormant") return `${styles.badge} ${styles.badgeDormant}`;
  return `${styles.badge} ${styles.badgeExpiring}`;
}

function WorkFacts({
  work,
  action
}: {
  work: ClassifiedWork;
  action: PrimaryAction;
}) {
  const view = equivalentView(work, action);
  return (
    <div data-testid={`facts-${work.id}`}>
      <h3 className={styles.workTitle}>{view.title}</h3>
      {view.romaji ? <p className={styles.romaji}>ローマ字併記: {view.romaji}</p> : null}
      <div className={styles.badgeRow}>
        <span className={badgeClass(work.state)} data-state={work.state}>
          {view.stateLabel}
        </span>
        <span className={styles.badge}>{view.statusLabel}</span>
      </div>
      <dl className={styles.facts}>
        <dt>視聴記録</dt>
        <dd>{view.watchedEpisodesLabel}</dd>
        <dt>配信話数</dt>
        <dd>{view.latestEpisodeLabel}</dd>
        <dt>配信終了</dt>
        <dd data-expiry={work.expiry.available ? "confirmed" : "unavailable"}>
          {view.expiryLabel}
        </dd>
        <dt>出典</dt>
        <dd>{view.sourceLabel}</dd>
        <dt>地域</dt>
        <dd>{view.regionLabel}</dd>
        <dt>確認日時</dt>
        <dd>{view.checkedAtLabel}</dd>
        <dt>正規配信</dt>
        <dd>{view.legalWatchLabel}</dd>
        <dt>次の一手</dt>
        <dd data-testid={`facts-action-${work.id}`}>{view.primaryAction}</dd>
      </dl>
    </div>
  );
}

export function MyListNextLab() {
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<DisplayMode>("visual");
  const [filter, setFilter] = useState<FilterId>("all");
  const [records, setRecords] = useState<SavedWork[]>(MY_LIST_FIXTURES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [status, setStatus] = useState("保存済み作品から、確認できた正規配信か見直し判断へ進めます。");
  const [done, setDone] = useState<Array<{ id: string; title: string; outcome: Outcome }>>([]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const classified = useMemo(() => classifyWorks(records, NOW), [records]);
  const visible = useMemo(() => filterWorks(classified, filter), [classified, filter]);
  const suggested = useMemo(() => {
    if (selectedId) {
      const selected = visible.find((work) => work.id === selectedId);
      if (selected) return selected;
    }
    return suggestNextWork(visible, filter);
  }, [visible, selectedId, filter]);
  const baseAction = suggested ? primaryActionFor(suggested) : null;
  const action =
    suggested && reviewOpen ? keepWatchingAction(suggested) : baseAction;

  function setFilterValue(next: FilterId) {
    setFilter(next);
    setSelectedId(null);
    setReviewOpen(false);
  }

  function selectWork(id: string) {
    setSelectedId(id);
    setReviewOpen(false);
  }

  function completeLegalWatch(work: ClassifiedWork) {
    setRecords((prev) => prev.filter((item) => item.id !== work.id));
    setDone((prev) => [...prev, { id: work.id, title: work.titleNative, outcome: "legal-watch" }]);
    setSelectedId(null);
    setReviewOpen(false);
    setStatus(`${work.titleNative} を確認済みの正規配信での視聴へ進めました。`);
  }

  function keepWatching(work: ClassifiedWork) {
    setRecords((prev) =>
      prev.map((item) =>
        item.id === work.id ? { ...item, lastTouchedAt: LAB_NOW_ISO } : item
      )
    );
    setReviewOpen(false);
    setSelectedId(work.id);
    setStatus(`${work.titleNative} を見続ける判断を記録しました。`);
  }

  function removeWork(work: ClassifiedWork) {
    setRecords((prev) => prev.filter((item) => item.id !== work.id));
    setDone((prev) => [...prev, { id: work.id, title: work.titleNative, outcome: "remove" }]);
    setSelectedId(null);
    setReviewOpen(false);
    setStatus(`${work.titleNative} をリストから外す判断を記録しました。`);
  }

  function onPrimary() {
    if (!suggested || !action) return;
    if (action.kind === "keep-watching") {
      keepWatching(suggested);
      return;
    }
    if (action.kind === "watch-legal") {
      completeLegalWatch(suggested);
      return;
    }
    setReviewOpen(true);
    setStatus(`${suggested.titleNative} の見直し判断です。見続けるか、リストから外すかを選べます。`);
  }

  return (
    <div
      className={styles.page}
      data-testid="lab-my-list-next"
      data-display-mode={mode}
      data-hydrated={hydrated ? "true" : "false"}
    >
      <p className={styles.kicker}>Lab · 本番のマイリストは変更していません</p>
      <h1 className={styles.title}>マイリストの次の一手</h1>
      <p className={styles.lead}>
        保存済み作品を未消化・長期放置・配信終了間近の3状態で見分け、確認できた正規配信での視聴か、本人の見直し判断へ一つだけ進めます。
      </p>

      <div className={styles.toolbar}>
        <div className={styles.modeToggle} role="group" aria-label="表示モード">
          <button
            type="button"
            className={styles.modeBtn}
            aria-pressed={mode === "visual"}
            data-testid="display-mode-visual"
            onClick={() => setMode("visual")}
          >
            Visual
          </button>
          <button
            type="button"
            className={styles.modeBtn}
            aria-pressed={mode === "simple"}
            data-testid="display-mode-simple"
            onClick={() => setMode("simple")}
          >
            Simple
          </button>
        </div>
        <div className={styles.filters} role="group" aria-label="状態フィルタ">
          {FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              className={styles.chip}
              aria-pressed={filter === id}
              data-testid={`filter-${id}`}
              onClick={() => setFilterValue(id)}
            >
              {FILTER_LABEL[id]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.panel} aria-labelledby="lab-next-heading">
          <h2 id="lab-next-heading" className={styles.panelTitle}>
            いまの次の一手
          </h2>
          {suggested && action ? (
            <>
              {mode === "visual" ? (
                <div className={styles.visualHead}>
                  <div
                    className={styles.poster}
                    role="img"
                    aria-label={`${suggested.titleNative} の識別用ポスター`}
                    style={{ background: suggested.posterTone }}
                    data-testid="visual-poster"
                  >
                    {suggested.titleNative}
                  </div>
                  <WorkFacts work={suggested} action={action} />
                </div>
              ) : (
                <WorkFacts work={suggested} action={action} />
              )}
              <p className={styles.hint}>
                キーボードの Enter で次の一手を完了できます。急かしの文言はありません。
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  data-testid="primary-next-action"
                  data-primary-action="true"
                  onClick={onPrimary}
                >
                  {action.label}
                </button>
                {reviewOpen ? (
                  <button
                    type="button"
                    className={styles.secondary}
                    data-testid="secondary-remove"
                    onClick={() => removeWork(suggested)}
                  >
                    リストから外す
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className={styles.empty} data-testid="empty-next">
              この状態の保存済み作品はありません。
            </p>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="lab-list-heading">
          <h2 id="lab-list-heading" className={styles.panelTitle}>
            保存済み作品
          </h2>
          <p className={styles.meta}>本人の保存記録が正本です。配信情報は推測しません。</p>
          {visible.length === 0 ? (
            <p className={styles.empty}>表示できる作品はありません。</p>
          ) : (
            <ul className={styles.list}>
              {visible.map((work) => {
                const itemAction = primaryActionFor(work);
                const view = equivalentView(work, itemAction);
                return (
                  <li key={work.id}>
                    <button
                      type="button"
                      className={styles.workSelect}
                      data-testid={`work-${work.id}`}
                      data-state={work.state}
                      aria-current={suggested?.id === work.id}
                      onClick={() => selectWork(work.id)}
                    >
                      <span className={styles.workSelectTitle}>{view.title}</span>
                      <span className={styles.workSelectMeta}>
                        {view.stateLabel} · {view.expiryLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section
        className={styles.culture}
        aria-labelledby="lab-culture-heading"
        data-testid="culture-cycle-check"
      >
        <h2 id="lab-culture-heading" className={styles.cultureTitle}>
          文化循環チェック
        </h2>
        <p className={styles.hint}>
          このモックは保存済み作品を、確認できた正規配信での視聴か、本人の見直し判断へ一つだけ動かします。
        </p>
        <ul className={styles.cultureList}>
          <li>ループ: 見たい（保存）→ 正規視聴、または見直し判断。次の一手は常に1つ。</li>
          <li>正規視聴: 地域・出典・確認日時が揃った配信のみ案内する。不明は unavailable。</li>
          <li>原典: 日本語タイトルを正とし、ローマ字は併記に留める。</li>
          <li>出典: 終了日を推測しない。公式または承認済みprovider以外は使わない。</li>
          <li>保存: 長期放置も残し、新作だけで導線を閉じない。</li>
          <li>評価: 優劣の断定や急かしの文言は置かない。</li>
          <li>指標: 未消化・長期放置・配信終了間近への着手。</li>
          <li>アクセス: 320–430pxとdesktop、44px、キーボード、可視フォーカス、reduced-motion。</li>
        </ul>
      </section>

      <p className={styles.statusBox} role="status" aria-live="polite" data-kind="status">
        {status}
      </p>
      {done.length > 0 ? (
        <p className={styles.meta} data-testid="done-log">
          対応済み: {done.map((item) => item.title).join("、")}
        </p>
      ) : null}
    </div>
  );
}
