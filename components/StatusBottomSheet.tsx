"use client";

import "./status-bottom-sheet.css";
import { ExternalLink, Minus, Plus, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { track } from "@/lib/analytics";
import type { AnimeStatusRecord, ViewingStatus } from "@/lib/statuses";
import { matchServiceIdByProviderName } from "@/lib/streaming-services";

const SHEET_STATUSES: ReadonlyArray<{ value: ViewingStatus; label: string }> = [
  { value: "planned", label: "見る予定" },
  { value: "watching", label: "視聴中" },
  { value: "completed", label: "完了" },
  { value: "paused", label: "中断" },
];

/** response ≈ 0.3s, damping ratio ≈ 0.8 (mass = 1) */
const SPRING_RESPONSE = 0.3;
const SPRING_DAMPING_RATIO = 0.8;
const SPRING_OMEGA = (2 * Math.PI) / SPRING_RESPONSE;
const SPRING_STIFFNESS = SPRING_OMEGA * SPRING_OMEGA;
const SPRING_DAMPING = 2 * SPRING_DAMPING_RATIO * SPRING_OMEGA;
const DISMISS_VELOCITY = 900;
const DISMISS_DISTANCE_RATIO = 0.28;
const RUBBER_CONSTANT = 0.55;
const BACKDROP_MAX = 0.55;

export type StatusBottomSheetProps = {
  open: boolean;
  record: AnimeStatusRecord | null;
  onClose: () => void;
  /** Fired after a successful local+API status change */
  onStatusSaved?: (animeId: string, status: ViewingStatus) => void;
  /** Fired after a successful local+API episode change */
  onEpisodesSaved?: (animeId: string, watchedEpisodes: number) => void;
};

function rubberBand(overshoot: number, limit: number): number {
  if (overshoot <= 0) return 0;
  return (overshoot * limit * RUBBER_CONSTANT) / (limit + overshoot * RUBBER_CONSTANT);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Shared bottom sheet for watch status + episode progress.
 * Gesture-driven open/close uses a small spring integrator (no motion package).
 */
export default function StatusBottomSheet({
  open,
  record,
  onClose,
  onStatusSaved,
  onEpisodesSaved,
}: StatusBottomSheetProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [status, setStatus] = useState<ViewingStatus>("planned");
  const [watched, setWatched] = useState(0);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingEpisodes, setSavingEpisodes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Physics state (refs so rAF / pointer handlers stay stable)
  const yRef = useRef(0);
  const vRef = useRef(0);
  const targetYRef = useRef(0);
  const draggingRef = useRef(false);
  const animatingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const grabOffsetRef = useRef(0);
  const lastMoveTsRef = useRef(0);
  const lastMoveYRef = useRef(0);
  const panelHeightRef = useRef(480);
  const closingRef = useRef(false);

  const applyVisual = useCallback((y: number) => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !backdrop) return;

    if (reducedMotion) {
      // Opacity is handled by .sbs-root--visible CSS; no transform animation
      panel.style.transform = "translate3d(-50%, 0, 0)";
      panel.style.opacity = "";
      backdrop.style.opacity = "";
      return;
    }

    const h = panelHeightRef.current || panel.offsetHeight || 480;
    const clampedProgress = Math.max(0, Math.min(1, 1 - y / h));
    panel.style.transform = `translate3d(-50%, ${y}px, 0)`;
    panel.style.opacity = "1";
    backdrop.style.opacity = String(BACKDROP_MAX * clampedProgress);
  }, [reducedMotion]);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
    animatingRef.current = false;
  }, []);

  const finishClose = useCallback(() => {
    closingRef.current = false;
    setVisible(false);
    setMounted(false);
    stopRaf();
    onClose();
  }, [onClose, stopRaf]);

  const tickSpring = useCallback(
    (ts: number) => {
      if (draggingRef.current) {
        rafRef.current = null;
        animatingRef.current = false;
        lastTsRef.current = null;
        return;
      }

      const last = lastTsRef.current ?? ts;
      let dt = (ts - last) / 1000;
      if (dt > 0.04) dt = 0.04;
      lastTsRef.current = ts;

      const target = targetYRef.current;
      let y = yRef.current;
      let v = vRef.current;

      // Semi-implicit Euler
      const accel = -SPRING_STIFFNESS * (y - target) - SPRING_DAMPING * v;
      v += accel * dt;
      y += v * dt;

      yRef.current = y;
      vRef.current = v;
      applyVisual(y);

      const settled =
        Math.abs(y - target) < 0.5 && Math.abs(v) < 8;

      if (settled) {
        yRef.current = target;
        vRef.current = 0;
        applyVisual(target);
        animatingRef.current = false;
        rafRef.current = null;
        lastTsRef.current = null;
        if (closingRef.current && target > 0) {
          finishClose();
        }
        return;
      }

      rafRef.current = requestAnimationFrame(tickSpring);
    },
    [applyVisual, finishClose]
  );

  const startSpring = useCallback(
    (target: number, velocity = vRef.current) => {
      targetYRef.current = target;
      vRef.current = velocity;
      draggingRef.current = false;
      animatingRef.current = true;
      lastTsRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tickSpring);
    },
    [tickSpring]
  );

  const measurePanel = useCallback(() => {
    const panel = panelRef.current;
    if (panel) {
      panelHeightRef.current = panel.offsetHeight || 480;
    }
  }, []);

  // Sync draft fields when record changes (while open)
  useEffect(() => {
    if (!record) return;
    setStatus(record.status);
    setWatched(record.watchedEpisodes ?? 0);
  }, [record?.animeId, record?.status, record?.watchedEpisodes]);

  // Guard async saves against the sheet switching to another anime (or closing)
  // while a request is in flight: late failures must not touch the new record's UI.
  const activeAnimeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeAnimeIdRef.current = open ? (record?.animeId ?? null) : null;
    if (record?.animeId) {
      setSavingStatus(false);
      setSavingEpisodes(false);
      setError(null);
    }
  }, [open, record?.animeId]);

  const requestClose = useCallback(() => {
    if (closingRef.current || !mounted) return;
    if (reducedMotion || prefersReducedMotion()) {
      finishClose();
      return;
    }
    closingRef.current = true;
    measurePanel();
    startSpring(panelHeightRef.current + 24, Math.max(vRef.current, 400));
  }, [finishClose, measurePanel, mounted, reducedMotion, startSpring]);

  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  // Open once when `open` becomes true for a record
  useEffect(() => {
    if (!open || !record?.anime) return;

    const reduced = prefersReducedMotion();
    setReducedMotion(reduced);
    setMounted(true);
    setVisible(true);
    setError(null);
    closingRef.current = false;

    const raf = requestAnimationFrame(() => {
      measurePanel();
      const h = panelHeightRef.current;
      if (reduced) {
        yRef.current = 0;
        vRef.current = 0;
        applyVisual(0);
        return;
      }
      yRef.current = h;
      vRef.current = 0;
      applyVisual(h);
      startSpring(0, 0);
    });

    return () => cancelAnimationFrame(raf);
    // Only re-open when open flips true or anime changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.animeId]);

  // Parent-driven close (open flipped to false while still mounted)
  useEffect(() => {
    if (open || !mounted || closingRef.current) return;
    if (reducedMotion || prefersReducedMotion()) {
      finishClose();
      return;
    }
    closingRef.current = true;
    measurePanel();
    startSpring(panelHeightRef.current + 24, Math.max(vRef.current, 200));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape + body scroll lock + initial focus
  useEffect(() => {
    if (!mounted || !visible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus();
    };
  }, [mounted, visible]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reducedMotion || event.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Interrupt spring mid-flight; keep current on-screen y
    stopRaf();
    draggingRef.current = true;
    closingRef.current = false;
    measurePanel();

    const rect = panel.getBoundingClientRect();
    // y is the translateY offset from the open (bottom-docked) position.
    // open top ≈ window.innerHeight - height; current top - openTop ≈ y
    const openTop = window.innerHeight - panelHeightRef.current;
    const currentY = Math.max(0, rect.top - openTop);
    yRef.current = currentY;
    grabOffsetRef.current = event.clientY - rect.top;
    vRef.current = 0;
    pointerIdRef.current = event.pointerId;
    lastMoveTsRef.current = event.timeStamp;
    lastMoveYRef.current = event.clientY;

    event.currentTarget.setPointerCapture(event.pointerId);
    applyVisual(currentY);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
    const openTop = window.innerHeight - panelHeightRef.current;
    const desiredTop = event.clientY - grabOffsetRef.current;
    let y = desiredTop - openTop;

    if (y < 0) {
      y = -rubberBand(-y, panelHeightRef.current * 0.35);
    }

    const now = event.timeStamp;
    const dt = Math.max(1, now - lastMoveTsRef.current) / 1000;
    const rawV = (event.clientY - lastMoveYRef.current) / dt;
    // EMA-ish for stability
    vRef.current = vRef.current * 0.35 + rawV * 0.65;
    lastMoveTsRef.current = now;
    lastMoveYRef.current = event.clientY;

    yRef.current = y;
    applyVisual(y);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
    draggingRef.current = false;
    pointerIdRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }

    const y = yRef.current;
    const v = vRef.current;
    const h = panelHeightRef.current;
    const shouldDismiss =
      v > DISMISS_VELOCITY || (v >= 0 && y > h * DISMISS_DISTANCE_RATIO);

    if (shouldDismiss) {
      closingRef.current = true;
      startSpring(h + 24, Math.max(v, 400));
    } else {
      closingRef.current = false;
      startSpring(0, v);
    }
  };

  async function handleStatusSelect(next: ViewingStatus) {
    if (!record?.anime || next === status || savingStatus) return;
    const animeId = record.animeId;
    const prev = status;
    setStatus(next);
    setSavingStatus(true);
    setError(null);
    try {
      const res = await fetch("/api/statuses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          status: next,
          anime: record.anime,
        }),
      });
      if (!res.ok) throw new Error("ステータスの保存に失敗しました。");
      track({ name: "status_update", from: prev, to: next, source: "bottom_sheet" });
      onStatusSaved?.(animeId, next);
    } catch (e) {
      if (activeAnimeIdRef.current !== animeId) return;
      setStatus(prev);
      setError(e instanceof Error ? e.message : "ステータスの保存に失敗しました。");
    } finally {
      if (activeAnimeIdRef.current === animeId) setSavingStatus(false);
    }
  }

  async function persistEpisodes(nextWatched: number) {
    if (!record?.anime) return;
    const animeId = record.animeId;
    const total = record.anime.episodes ?? null;
    const clamped =
      total != null ? Math.max(0, Math.min(total, nextWatched)) : Math.max(0, nextWatched);
    const prev = watched;
    setWatched(clamped);
    setSavingEpisodes(true);
    setError(null);
    try {
      // Preserve existing tracking fields (API overwrites all four together)
      const res = await fetch("/api/watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          favoriteLevel: record.favoriteLevel,
          watchSlot: record.watchSlot,
          notes: record.notes,
          watchedEpisodes: clamped,
        }),
      });
      if (!res.ok) throw new Error("視聴話数の保存に失敗しました。");
      track({ name: "episode_update", source: "bottom_sheet" });
      onEpisodesSaved?.(animeId, clamped);
    } catch (e) {
      if (activeAnimeIdRef.current !== animeId) return;
      setWatched(prev);
      setError(e instanceof Error ? e.message : "視聴話数の保存に失敗しました。");
    } finally {
      if (activeAnimeIdRef.current === animeId) setSavingEpisodes(false);
    }
  }

  if (!mounted || !record?.anime) return null;

  const anime = record.anime;
  const totalEps = anime.episodes ?? null;
  const showStepper = totalEps != null || record.watchedEpisodes != null || watched > 0;
  const cover = anime.proxiedImageUrl || anime.imageUrl || null;
  const displayWatched =
    totalEps != null ? Math.max(0, Math.min(totalEps, watched)) : Math.max(0, watched);

  const flatrate = anime.streamingProvidersJp?.flatrate ?? [];
  const seen = new Set<string>();
  const chips = flatrate.flatMap((provider) => {
    const serviceId = matchServiceIdByProviderName(provider.name);
    if (!serviceId || seen.has(serviceId)) return [];
    seen.add(serviceId);
    return [{ provider, serviceId }];
  });
  const hasUnmatched = flatrate.some((p) => matchServiceIdByProviderName(p.name) === null);
  const streamingEpisodes = anime.streamingEpisodes ?? [];
  const platformLinks = anime.streamingPlatforms ?? [];

  const rootClass = [
    "sbs-root",
    "sbs-root--open",
    visible ? "sbs-root--visible" : "",
    reducedMotion ? "sbs-root--reduced" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        ref={backdropRef}
        type="button"
        className="sbs-backdrop"
        aria-label="閉じる"
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        className="sbs-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div
          className="sbs-handle-zone"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="sbs-handle" aria-hidden="true" />
        </div>

        <div className="sbs-close-row">
          <button
            ref={closeBtnRef}
            type="button"
            className="sbs-close-btn"
            aria-label="閉じる"
            onClick={requestClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="sbs-body">
          <div className="sbs-header">
            <div className="sbs-thumb">
              {cover ? (
                <img src={cover} alt="" loading="lazy" />
              ) : (
                <div className="sbs-thumb-fallback">No Image</div>
              )}
            </div>
            <h2 id={titleId} className="sbs-title">
              {anime.title}
            </h2>
          </div>

          {error ? (
            <p className="sbs-error" role="alert">
              {error}
            </p>
          ) : null}

          <p className="sbs-section-label">視聴ステータス</p>
          <div className="sbs-status-grid" role="group" aria-label="視聴ステータス">
            {SHEET_STATUSES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`sbs-status-btn${status === item.value ? " sbs-status-btn--active" : ""}`}
                aria-pressed={status === item.value}
                disabled={savingStatus}
                onClick={() => void handleStatusSelect(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {showStepper ? (
            <div className="sbs-episodes">
              <span className="sbs-episodes-label">視聴話数</span>
              <div className="sbs-stepper">
                <button
                  type="button"
                  className="sbs-stepper-btn"
                  aria-label="視聴話数を減らす"
                  disabled={savingEpisodes || displayWatched <= 0}
                  onClick={() => void persistEpisodes(displayWatched - 1)}
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
                <span className="sbs-stepper-value">
                  {displayWatched}
                  {totalEps != null ? ` / ${totalEps}` : ""} 話
                </span>
                <button
                  type="button"
                  className="sbs-stepper-btn"
                  aria-label="視聴話数を増やす"
                  disabled={
                    savingEpisodes || (totalEps != null && displayWatched >= totalEps)
                  }
                  onClick={() => void persistEpisodes(displayWatched + 1)}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}

          {chips.length > 0 || hasUnmatched || streamingEpisodes.length > 0 || platformLinks.length > 0 ? (
            <>
              <p className="sbs-section-label">配信サービス</p>
              <div className="sbs-streaming" aria-label="配信サービス">
                {chips.map(({ provider, serviceId }) => (
                  <a
                    key={serviceId}
                    href={`/api/go/${serviceId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="sbs-stream-chip"
                  >
                    {provider.logoUrl ? (
                      <img src={provider.logoUrl} alt="" loading="lazy" />
                    ) : null}
                    {provider.name}
                    <ExternalLink size={12} aria-hidden="true" />
                    <span className="sr-only">（新しいタブで開きます）</span>
                  </a>
                ))}
                {hasUnmatched && anime.streamingProvidersJp?.providerLink ? (
                  <a
                    href={anime.streamingProvidersJp.providerLink}
                    target="_blank"
                    rel="noreferrer"
                    className="sbs-stream-chip"
                  >
                    配信情報を見る
                    <ExternalLink size={12} aria-hidden="true" />
                    <span className="sr-only">（新しいタブで開きます）</span>
                  </a>
                ) : null}
                {platformLinks.slice(0, 4).map((platform) => (
                  <a
                    key={`${platform.name}-${platform.url}`}
                    href={platform.url}
                    target="_blank"
                    rel="noreferrer"
                    className="sbs-stream-chip"
                  >
                    {platform.name}
                    <ExternalLink size={12} aria-hidden="true" />
                    <span className="sr-only">（新しいタブで開きます）</span>
                  </a>
                ))}
                {streamingEpisodes.slice(0, 3).map((ep) => (
                  <a
                    key={ep.url}
                    href={ep.url}
                    target="_blank"
                    rel="noreferrer"
                    className="sbs-stream-chip"
                  >
                    {ep.site || ep.title || "配信エピソード"}
                    <ExternalLink size={12} aria-hidden="true" />
                    <span className="sr-only">（新しいタブで開きます）</span>
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
