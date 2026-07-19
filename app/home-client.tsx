"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDisplayMode } from "@/components/display-mode/DisplayModeProvider";
import HomeAddSection, { type SeasonScope } from "@/components/HomeAddSection";
import HomeContextCards from "@/components/HomeContextCards";
import StatusBottomSheet from "@/components/StatusBottomSheet";
import { WeeklyBroadcastCalendar } from "@/components/WeeklyBroadcastCalendar";
import { track } from "@/lib/analytics";
import { BROADCAST_WEEKDAYS, groupItemsByBroadcastDay, withFreshAiring } from "@/lib/broadcast-calendar";
import type { HomeNextAction } from "@/lib/home-next-actions";
import { bucketBySeason } from "@/lib/season-bucket";
import { selectUnregisteredSeasonalAnime } from "@/lib/home-seasonal-add";
import { getNextAnimeSeason } from "@/lib/season";
import { useSeasonalPrefetch } from "@/lib/use-seasonal-prefetch";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";
import { EditSheet, PosterLane, useWatchlistV2Editor } from "./watchlist/watchlist-client-v2-grok";

// Reuse Grok watchlist styles for PosterCard / PosterLane
import "./watchlist/watchlist-v2-grok.css";

type HomeClientProps = {
  initialItems: AnimeStatusRecord[];
  initialSeasonalAnime: AnimeItem[];
};

type HomeNextActionViewState =
  | { kind: "loading" }
  | { kind: "success"; action: HomeNextAction }
  | { kind: "empty" }
  | { kind: "error" };

const ONBOARDING_DISMISSED_KEY = "anime-tier-board:onboarding:n2-dismissed";

const STATUS_LABEL: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "視聴済",
  paused: "一時停止",
  dropped: "中断",
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function hasNextActions(value: unknown): value is { nextActions: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { nextActions?: unknown }).nextActions)
  );
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isHomeNextAction(value: unknown): value is HomeNextAction {
  if (typeof value !== "object" || value === null) return false;

  const action = value as {
    anime?: unknown;
    reasonLabel?: unknown;
    status?: unknown;
    watchedEpisodes?: unknown;
    latestAvailableEpisode?: unknown;
    unwatchedEpisodes?: unknown;
  };
  if (
    typeof action.reasonLabel !== "string" ||
    typeof action.status !== "string" ||
    !Object.hasOwn(STATUS_LABEL, action.status) ||
    typeof action.anime !== "object" ||
    action.anime === null ||
    !isNullableFiniteNumber(action.watchedEpisodes) ||
    !isNullableFiniteNumber(action.latestAvailableEpisode) ||
    !isNullableFiniteNumber(action.unwatchedEpisodes)
  ) {
    return false;
  }

  return typeof (action.anime as { title?: unknown }).title === "string";
}

function resolveNextActionImageUrl(action: HomeNextAction): string | null {
  const proxied =
    typeof action.anime.proxiedImageUrl === "string" ? action.anime.proxiedImageUrl.trim() : "";
  if (proxied) return proxied;
  const original =
    typeof action.anime.imageUrl === "string" ? action.anime.imageUrl.trim() : "";
  if (original) return original;
  return null;
}

function formatNextActionMeta(action: HomeNextAction): string | null {
  const parts: string[] = [];
  const statusLabel = STATUS_LABEL[action.status];
  if (statusLabel) {
    parts.push(statusLabel);
  }
  if (action.watchedEpisodes !== null && action.latestAvailableEpisode !== null) {
    parts.push(`${action.watchedEpisodes}/${action.latestAvailableEpisode}話`);
  } else if (action.unwatchedEpisodes !== null && action.unwatchedEpisodes > 0) {
    parts.push(`未視聴 ${action.unwatchedEpisodes}話`);
  } else if (action.watchedEpisodes !== null) {
    parts.push(`${action.watchedEpisodes}話まで記録`);
  } else if (action.latestAvailableEpisode !== null) {
    parts.push(`最新 ${action.latestAvailableEpisode}話`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * ホームのクライアントエントリ（方針③ N1c）。
 * ログイン済みホームは「今週の放映カレンダー」を中心に構成する。
 * ステータス変更の楽観更新はここで一元管理し、今期から追加 ↔ 視聴中/見たい の反映を担う。
 */
export function HomeClient({ initialItems, initialSeasonalAnime }: HomeClientProps) {
  const router = useRouter();
  const { mode, hydrated } = useDisplayMode();
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  const [seasonScope, setSeasonScope] = useState<SeasonScope>("current");
  const [nextSeasonAnime, setNextSeasonAnime] = useState<AnimeItem[] | null>(null);
  const [nextSeasonLoading, setNextSeasonLoading] = useState(false);
  const [nextSeasonError, setNextSeasonError] = useState<string | null>(null);
  const [nextActionState, setNextActionState] = useState<HomeNextActionViewState>({ kind: "loading" });
  const nextActionAbortRef = useRef<AbortController | null>(null);
  useSeasonalPrefetch(initialSeasonalAnime);

  const fetchNextAction = useCallback(() => {
    nextActionAbortRef.current?.abort();
    const controller = new AbortController();
    nextActionAbortRef.current = controller;
    setNextActionState({ kind: "loading" });

    fetch("/api/home", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted) return;

        if (!response.ok) {
          setNextActionState({ kind: "error" });
          return;
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          if (controller.signal.aborted) return;
          setNextActionState({ kind: "error" });
          return;
        }

        if (controller.signal.aborted) return;

        if (!hasNextActions(payload)) {
          setNextActionState({ kind: "error" });
          return;
        }

        const first = payload.nextActions[0];
        if (first === undefined) {
          setNextActionState({ kind: "empty" });
        } else if (isHomeNextAction(first)) {
          setNextActionState({ kind: "success", action: first });
        } else {
          setNextActionState({ kind: "error" });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setNextActionState({ kind: "error" });
      });
  }, []);

  useEffect(() => {
    fetchNextAction();
    return () => {
      nextActionAbortRef.current?.abort();
    };
  }, [fetchNextAction]);

  // Prefetch targets from home broadcast-calendar card taps (and general nav)
  // Ensures tapping cards has destination and /tier data paths warmed.
  useEffect(() => {
    router.prefetch("/watchlist");
    router.prefetch("/tier");
  }, [router]);

  useEffect(() => {
    setIsOnboardingDismissed(window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true");
    setHasCheckedOnboarding(true);
  }, []);

  // Single source of truth for items + edit sheet (shared with /watchlist)
  const editor = useWatchlistV2Editor(initialItems);
  const {
    items,
    openSheet,
    closeSheet,
    editing,
    draftStatus,
    setDraftStatus,
    draftFavorite,
    setDraftFavorite,
    draftWatchSlot,
    setDraftWatchSlot,
    draftNotes,
    setDraftNotes,
    draftWatched,
    setDraftWatched,
    savingId,
    changeStatus,
    saveTracking,
    removeItem,
    quickSetStatus,
    patchRecord,
    message,
    messageKind,
  } = editor;

  // Status bottom sheet (calendar card tap — no page navigation)
  const [statusSheetRecord, setStatusSheetRecord] = useState<AnimeStatusRecord | null>(null);

  // Keep sheet record in sync with items after optimistic patches
  const liveStatusSheetRecord = useMemo(() => {
    if (!statusSheetRecord) return null;
    return items.find((r) => r.animeId === statusSheetRecord.animeId) ?? statusSheetRecord;
  }, [items, statusSheetRecord]);

  const addSectionItems = useMemo(
    () =>
      selectUnregisteredSeasonalAnime(
        seasonScope === "current" ? initialSeasonalAnime : nextSeasonAnime ?? [],
        items,
        // ホームでは「もっと見る」で段階的に表示するため、ここでは絞り込まず
        // 未登録の今期/来期作品をまとめて渡す（実際の表示件数はHomeAddSection側で制御）。
        200
      ),
    [initialSeasonalAnime, nextSeasonAnime, seasonScope, items]
  );

  const handleSelectSeasonScope = useCallback(
    (scope: SeasonScope) => {
      setSeasonScope(scope);

      if (scope !== "next" || nextSeasonAnime !== null || nextSeasonLoading) {
        return;
      }

      setNextSeasonLoading(true);
      setNextSeasonError(null);

      const { year, season } = getNextAnimeSeason();
      fetch(`/api/anime/seasonal?year=${year}&season=${season}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json()) as { items?: AnimeItem[]; error?: string };
          if (!response.ok) {
            throw new Error(payload.error ?? "来期アニメの取得に失敗しました。");
          }
          setNextSeasonAnime(payload.items ?? []);
        })
        .catch((error: unknown) => {
          // nextSeasonAnime は null のままにする。「来期」を再度選ぶとガード
          // (nextSeasonAnime !== null) に引っかからず再フェッチできる。
          setNextSeasonError(error instanceof Error ? error.message : "来期アニメの取得に失敗しました。");
        })
        .finally(() => setNextSeasonLoading(false));
    },
    [nextSeasonAnime, nextSeasonLoading]
  );

  const addSection = (
    <>
      {message ? (
        <div
          className={`notice ${messageKind}`}
          style={{ margin: "8px 12px" }}
          role={messageKind === "error" ? "alert" : "status"}
          aria-live={messageKind === "error" ? undefined : "polite"}
        >
          {message}
        </div>
      ) : null}
      <HomeAddSection
        items={addSectionItems}
        onQuickStatus={quickSetStatus}
        seasonScope={seasonScope}
        onSelectSeasonScope={handleSelectSeasonScope}
        loading={seasonScope === "next" && nextSeasonLoading}
        error={seasonScope === "next" ? nextSeasonError : null}
      />
    </>
  );
  const handleDismissOnboarding = useCallback(() => {
    setIsOnboardingDismissed(true);
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
  }, []);

  // 保存時スナップショットの airing は陳腐化する(次回放送日が過去になる)ため、
  // 取得済みの今期データから最新へ差し替えてからカレンダー判定する。
  const calendarItems = useMemo(
    () =>
      withFreshAiring(
        items.filter(
          (item) => item.status === "watching" || item.status === "planned"
        ),
        initialSeasonalAnime
      ),
    [items, initialSeasonalAnime]
  );
  const grouped = useMemo(() => groupItemsByBroadcastDay(calendarItems), [calendarItems]);
  const hasCalendar = BROADCAST_WEEKDAYS.some((day) => grouped[day].length > 0);

  // Rails data (intentional duplication of watching/planned in season buckets per spec)
  const watchingItems = useMemo(() => {
    return items
      .filter((r) => r.status === "watching")
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [items]);

  const plannedItems = useMemo(() => {
    return items.filter((r) => r.status === "planned");
  }, [items]);

  const seasonBuckets = useMemo(() => bucketBySeason(items), [items]);

  const nextActionPanel = (
    <HomeNextActionPanel
      state={nextActionState}
      hydrated={hydrated}
      mode={mode}
      onRetry={fetchNextAction}
    />
  );

  if (items.length === 0) {
    return (
      <HomeEmptyGuide
        nextActionPanel={nextActionPanel}
        addSection={addSection}
        showOnboarding={hasCheckedOnboarding && !isOnboardingDismissed}
        onDismiss={handleDismissOnboarding}
      />
    );
  }

  return (
    <main className="app-main home-main">
      <h1 className="sr-only">ホーム</h1>

      {nextActionPanel}

      {/* 続きを見る — watching, updatedAt desc */}
      {watchingItems.length > 0 ? (
        <PosterLane
          title="続きを見る"
          records={watchingItems}
          onOpenCard={openSheet}
        />
      ) : null}

      {/* 今期 / 来期 / その他 — bucketBySeason over all */}
      {seasonBuckets.map((bucket) => (
        <PosterLane
          key={bucket.key}
          title={bucket.label}
          hint={bucket.hint}
          records={bucket.items}
          onOpenCard={openSheet}
        />
      ))}

      {/* 期まとめ共有CTA — 今期視聴作品がある場合のみ表示 (#595) */}
      {(seasonBuckets.find((bucket) => bucket.key === "current")?.items.length ?? 0) > 0 ? (
        <section className="home-season-share" aria-labelledby="home-season-share-title">
          <h2 className="sr-only" id="home-season-share-title">
            今期のアニメを共有
          </h2>
          <Link href="/lab/promote?from=home" className="home-season-share-link">
            今期のアニメをまとめて共有
          </Link>
        </section>
      ) : null}

      {/* 見たい — planned */}
      {plannedItems.length > 0 ? (
        <PosterLane
          title="見たい"
          records={plannedItems}
          onOpenCard={openSheet}
        />
      ) : null}

      {/* 発見レーン（今期新着おすすめ） — preserved as-is */}
      {addSection}

      {/* 放映カレンダー — bottom */}
      {hasCalendar ? (
        <WeeklyBroadcastCalendar
          grouped={grouped}
          onItemClick={(record) => {
            track({ name: "home_card_tap", card_type: "calendar" });
            track({ name: "calendar_item_tap" });
            setStatusSheetRecord(record);
          }}
        />
      ) : (
        <section className="home-calendar-empty">
          <h2 className="watchlist-broadcast-lanes-heading">今週の放映カレンダー</h2>
          <p className="home-calendar-empty-note">
            今週の放映予定がまだありません。今期のアニメから「視聴中」「見たい」を追加すると、ここに曜日別で表示されます。
          </p>
        </section>
      )}

      {/* 文脈カード（期末 Tier / 月初サブスク）— カレンダー下。カレンダーを押し下げない */}
      <HomeContextCards />

      {/* Shared Grok edit sheet */}
      {editing && editing.anime ? (
        <EditSheet
          record={editing}
          draftStatus={draftStatus}
          draftFavorite={draftFavorite}
          draftWatchSlot={draftWatchSlot}
          draftNotes={draftNotes}
          draftWatched={draftWatched}
          saving={savingId === editing.animeId}
          onClose={closeSheet}
          onStatusChange={(s) => void changeStatus(editing, s)}
          onFavoriteChange={setDraftFavorite}
          onWatchSlotChange={setDraftWatchSlot}
          onNotesChange={setDraftNotes}
          onWatchedChange={setDraftWatched}
          onSave={() => void saveTracking(editing)}
          onRemove={() => void removeItem(editing)}
        />
      ) : null}

      <StatusBottomSheet
        open={Boolean(liveStatusSheetRecord?.anime)}
        record={liveStatusSheetRecord}
        onClose={() => setStatusSheetRecord(null)}
        onStatusSaved={(animeId, nextStatus) => {
          patchRecord(animeId, { status: nextStatus });
        }}
        onEpisodesSaved={(animeId, watchedEpisodes) => {
          patchRecord(animeId, { watchedEpisodes });
        }}
      />
    </main>
  );
}

type HomeNextActionPanelProps = {
  state: HomeNextActionViewState;
  hydrated: boolean;
  mode: "visual" | "simple";
  onRetry: () => void;
};

function HomeNextActionPanel({ state, hydrated, mode, onRetry }: HomeNextActionPanelProps) {
  if (state.kind === "loading") {
    return (
      <section className="home-next-action" aria-label="次にやること">
        <p className="home-next-action-loading" aria-live="polite">
          読み込み中…
        </p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="home-next-action" aria-label="次にやること">
        <div className="home-next-action-error" role="alert">
          <p className="home-next-action-error-text">次のアクションを取得できませんでした。</p>
          <button
            type="button"
            className="home-next-action-retry"
            onClick={onRetry}
          >
            再試行
          </button>
        </div>
      </section>
    );
  }

  if (state.kind === "empty") {
    return (
      <section className="home-next-action" aria-label="次にやること">
        <p className="home-next-action-empty">今すぐやることがありません</p>
      </section>
    );
  }

  const { action } = state;
  const imageUrl = resolveNextActionImageUrl(action);
  const showImage = hydrated && mode === "visual" && Boolean(imageUrl);
  const meta = formatNextActionMeta(action);

  return (
    <section className="home-next-action" aria-label="次にやること">
      <article className="home-next-action-card">
        {showImage && imageUrl ? (
          <img
            className="home-next-action-img"
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="home-next-action-body">
          <h2 className="home-next-action-title">{action.anime.title}</h2>
          <p className="home-next-action-reason">{action.reasonLabel}</p>
          {meta ? <p className="home-next-action-meta">{meta}</p> : null}
          <Link href="/watchlist" className="home-next-action-link">
            視聴管理を見る
          </Link>
        </div>
      </article>
    </section>
  );
}

/** ログイン済み・未登録ユーザー向けのインラインガイド。 */
type HomeEmptyGuideProps = {
  nextActionPanel?: ReactNode;
  addSection: ReactNode;
  showOnboarding: boolean;
  onDismiss: () => void;
};

export function HomeEmptyGuide({
  nextActionPanel,
  addSection,
  showOnboarding,
  onDismiss,
}: HomeEmptyGuideProps) {
  return (
    <main className="app-main home-main">
      <h1 className="sr-only">ホーム</h1>
      {nextActionPanel}
      {showOnboarding ? (
        <section className="home-guide" aria-labelledby="home-guide-title">
        <h2 className="home-guide-title" id="home-guide-title">
          まずは視聴中を1本だけ追加
        </h2>
        <p className="home-guide-body">
          今季の作品から気になる1本を「視聴中」にすると、ホームが今夜見るリストとして使えます。
        </p>
        <ol className="home-guide-hints">
          <li>下の「今季から追加」で作品を探す</li>
          <li>気になる作品を「視聴中」にする</li>
          <li>あとはホームで追いかける</li>
        </ol>
        <div className="home-guide-actions">
          <Link href="#home-add-section" className="command-button emphasis-button">
            今季の作品を見る
          </Link>
          <button className="command-button" type="button" onClick={onDismiss}>
            あとで
          </button>
        </div>
        </section>
      ) : null}
      {addSection}
    </main>
  );
}
