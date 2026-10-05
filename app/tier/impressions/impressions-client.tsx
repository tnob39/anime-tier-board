"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type RefObject } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DisplayModeToggle } from "@/components/display-mode/DisplayModeToggle";
import { ImpressionArtwork } from "@/components/ImpressionSnapshotView";
import { SeasonContextControl } from "@/components/SeasonContextControl";
import { useSeasonUrlState } from "@/components/useSeasonUrlState";
import { fetchSeasonalAnimeClient } from "@/lib/seasonal-anime-client-cache";
import { IMPRESSION_DRAFT_KEY, readImpressionDraft, impressionReturnPath, ownerImpressionDraftKey, readOwnerImpressionDrafts,
  type ImpressionDraft, type OwnerImpressionDrafts } from "@/lib/season-impression-draft";
import { IMPRESSION_RATINGS, IMPRESSION_RATING_LABELS, impressionNoteLength, readImpressionAnime,
  type ImpressionAnime, type ImpressionInput, type ImpressionSeason, type ImpressionSeasonState, type ImpressionRevisionCursor, type SeasonImpression } from "@/lib/season-impressions-model";
import { ImpressionSharing } from "./impression-sharing";
import { ImpressionSeasonCard } from "./impression-season-card";
import { changeImpressionInput, clampDateToSeason, impressionCandidatesForDate, impressionAiringLabel, impressionGrowthCopy,
  impressionWeek, jstDateKey, searchImpressionCatalog, shiftDateKey, type ImpressionAiring } from "@/lib/season-impressions-view";
import { track } from "@/lib/analytics";
import { impressionError, impressionRequest } from "./impressions-request";

type Props = { seasonKey: ImpressionSeason; resumeToken: string | null };
type Reconciliation = { message: string; readVersion: number | null };

function errorStatus(error: unknown): number | undefined {
  return error instanceof Error ? (error as Error & { status?: number }).status : undefined;
}
export function ImpressionsClient(props: Props) {
  const { ref, explicit } = useSeasonUrlState(props.seasonKey);
  const [pending, setPending] = useState(false);
  const canChangeSeason = useRef(() => true);
  const { data: session, status } = useSession();
  if (status === "loading") return <div className="impressions-page" role="status">今期チェックを準備しています…</div>;
  const userId = status === "authenticated" ? (session?.user as { id?: string } | undefined)?.id ?? null : null;
  return <div className="impressions-page">
    <header className="impressions-header"><h1>今期チェック</h1><p>{ref.year}年{({ WINTER: "冬", SPRING: "春", SUMMER: "夏", FALL: "秋" } as const)[ref.season]}の作品に、いまの一言を残す</p></header>
    <details className="impressions-settings"><summary>期と表示を変更</summary><div className="impressions-settings-content"><SeasonContextControl value={ref} explicit={explicit} disabled={pending} onChange={(next) => {
      if (!canChangeSeason.current()) return false;
      const params = new URLSearchParams(window.location.search);
      params.set("year", String(next.year));
      params.set("season", next.season);
      params.set("date", clampDateToSeason(params.get("date"), next));
      history.pushState(null, "", `${location.pathname}?${params}${location.hash}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }} /><DisplayModeToggle /></div></details>
    <ImpressionsWorkspace key={`${userId ? `owner:${userId}` : "guest"}:${ref.year}:${ref.season}`}
      {...props} seasonKey={ref} userId={userId} pending={pending} setPending={setPending} canChangeSeason={canChangeSeason} />
  </div>;
}

function ImpressionsWorkspace({ seasonKey, resumeToken, userId, pending, setPending, canChangeSeason }: Props & {
  userId: string | null; pending: boolean; setPending: Dispatch<SetStateAction<boolean>>; canChangeSeason: RefObject<() => boolean>;
}) {
  const [anime, setAnime] = useState<ImpressionAnime[]>([]);
  const [records, setRecords] = useState<SeasonImpression[]>([]);
  const [deletedRevisions, setDeletedRevisions] = useState<ImpressionRevisionCursor[]>([]);
  const [recordsReady, setRecordsReady] = useState(!userId);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [warning, setWarning] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ImpressionInput>>({});
  const draftRef = useRef<Record<string, ImpressionInput>>({});
  const [storageError, setStorageError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [airing, setAiring] = useState<ImpressionAiring[]>([]);
  const [draftsReady, setDraftsReady] = useState(!userId);
  const restored = useRef(false);
  const [selectedDate, setSelectedDate] = useState(() => clampDateToSeason(typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("date"), seasonKey));
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [view, setView] = useState<"entry" | "search" | "card">("entry");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unchecked" | "saved">("all");
  const [page, setPage] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reconciliations, setReconciliations] = useState<Record<string, Reconciliation>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const editorRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const viewHeading = useRef<HTMLHeadingElement>(null);
  const focusView = useRef(false);
  const shareStep = useSearchParams().get("share");
  const sharingActive = !!userId && ["select", "preview", "result", "manage"].includes(shareStep ?? "");
  const requestVersion = useRef(0);
  const recordsVersion = useRef(0);
  const readingRecords = useRef(false);
  const writingRecords = useRef(false);
  const editingInput = editing ? drafts[editing] : undefined;
  const saved = records.find((record) => record.anime.id === editing);
  const reconciliation = editing ? reconciliations[editing] : undefined;
  const conflict = !!reconciliation;
  const latestLoaded = reconciliation?.readVersion === recordsVersion.current && recordsReady;
  const seasonStart = clampDateToSeason("1970-01-01", seasonKey);
  const seasonEnd = clampDateToSeason("9999-12-31", seasonKey);

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const date = clampDateToSeason(params.get("date"), seasonKey);
      setSelectedDate(date);
      if (params.get("date") !== date) { params.set("date", date); history.replaceState(history.state, "", `${location.pathname}?${params}${location.hash}`); }
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [seasonKey.year, seasonKey.season]);

  useEffect(() => {
    if (editing) noteRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);
  useEffect(() => {
    if (!editing && focusView.current) { viewHeading.current?.focus(); focusView.current = false; }
  }, [view, editing, message]);

  useLayoutEffect(() => {
    setPending(false);
    canChangeSeason.current = () => !busy.current && (!Object.keys(draftRef.current).length
      || window.confirm("未保存の入力があります。クールを切り替えますか？"));
    return () => { canChangeSeason.current = () => true; };
  }, [canChangeSeason, setPending]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = editorRef.current?.closest<HTMLElement>(".bottom-sheet-root");
    if (!editing || !viewport || !root) return;
    const fit = () => {
      root.style.top = `${viewport.offsetTop}px`;
      root.style.height = `${viewport.height}px`;
      root.style.bottom = "auto";
      root.style.setProperty("--impressions-viewport-height", `${viewport.height}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => { viewport.removeEventListener("resize", fit); viewport.removeEventListener("scroll", fit); };
  }, [editing]);

  const readRecords = useCallback(async () => {
    if (!userId) return [];
    if (writingRecords.current) throw new Error("記録を保存しています。完了後に最新の記録を確認してください。");
    const version = ++recordsVersion.current;
    readingRecords.current = true;
    setRecordsReady(false);
    try {
      const result = await impressionRequest<ImpressionSeasonState>(`/api/season-impressions?year=${seasonKey.year}&season=${seasonKey.season}`, {
        headers: { "X-Impression-Owner": encodeURIComponent(userId) }
      });
      if (!mounted.current || version !== recordsVersion.current) throw new Error("記録の読み込みが更新されました。もう一度最新の記録を確認してください。");
      setRecords(result.impressions); setDeletedRevisions(result.deletedRevisions); setRecordsReady(true); setAuthRequired(false);
      return result.impressions;
    } catch (failure) {
      if (mounted.current && version === recordsVersion.current) {
        setRecordsReady(false);
        setLoadError("保存済みの記録を取得できませんでした。再試行してください。");
        if (errorStatus(failure) === 401) setAuthRequired(true);
      }
      throw failure;
    } finally {
      if (version === recordsVersion.current) readingRecords.current = false;
    }
  }, [userId, seasonKey.year, seasonKey.season]);

  const load = useCallback(async () => {
    if (busy.current) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError("");
    const results = await Promise.allSettled([fetchSeasonalAnimeClient(seasonKey.year, seasonKey.season), readRecords()]);
    if (!mounted.current || version !== requestVersion.current) return;
    const failures: string[] = [];
    if (results[0].status === "fulfilled") {
      setAnime(results[0].value.items.map(readImpressionAnime).filter((item): item is ImpressionAnime => item !== null));
      setAiring(results[0].value.items.map(({ id, airing }) => ({ id, airing })));
      setWarning(results[0].value.warning ?? "");
    } else failures.push("作品一覧を取得できませんでした。保存済みの記録は引き続き編集できます。");
    if (results[1].status === "rejected") {
      failures.push("保存済みの記録を取得できませんでした。再試行してください。");
      if (errorStatus(results[1].reason) === 401) setAuthRequired(true);
    }
    setLoadError(failures.join(" "));
    setLoading(false);
  }, [seasonKey.year, seasonKey.season, readRecords]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; requestVersion.current += 1; recordsVersion.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!userId || !recordsReady || restored.current) return;
    restored.current = true;
    try {
      const key = ownerImpressionDraftKey(userId, seasonKey);
      const own = readOwnerImpressionDrafts(sessionStorage.getItem(key), userId, seasonKey);
      let inputs = Object.fromEntries((own?.inputs ?? []).map((input) => [input.anime.id, input]));
      let active = own?.editing ?? null;
      const draft = readImpressionDraft(sessionStorage.getItem(IMPRESSION_DRAFT_KEY), resumeToken, userId);
      if (draft && draft.input.year === seasonKey.year && draft.input.season === seasonKey.season) {
        inputs = { ...inputs, [draft.input.anime.id]: draft.input };
        active = draft.input.anime.id;
        // Bind before exposing or consuming a guest handoff; failure leaves it unavailable.
        const claimed = JSON.stringify({ ...draft, ownerId: userId });
        sessionStorage.setItem(IMPRESSION_DRAFT_KEY, claimed);
        if (sessionStorage.getItem(IMPRESSION_DRAFT_KEY) !== claimed) throw new Error("draft storage failed");
        const bound = JSON.stringify({ version: 2, ownerId: userId, createdAt: Date.now(), inputs: Object.values(inputs), editing: active } satisfies OwnerImpressionDrafts);
        sessionStorage.setItem(key, bound);
        if (sessionStorage.getItem(key) !== bound) throw new Error("draft storage failed");
        sessionStorage.removeItem(IMPRESSION_DRAFT_KEY);
      }
      draftRef.current = inputs;
      setDrafts(inputs);
      setEditing(new URLSearchParams(window.location.search).has("share") ? null : active);
      if (Object.keys(inputs).length) setMessage("このアカウントの未保存の入力を復元しました。内容を確認して保存してください。");
      else if (resumeToken) setMessage("このアカウントで復元できる下書きはありません。元のアカウントでログインしてください。");
    } catch { setStorageError("下書きを読み込めませんでした。ブラウザの保存設定を確認してください。"); }
    finally { setDraftsReady(true); }
  }, [resumeToken, userId, recordsReady, seasonKey.year, seasonKey.season]);

  function keepDrafts(next: Record<string, ImpressionInput>, active: string | null) {
    draftRef.current = next;
    setDrafts(next);
    if (!userId) return;
    try {
      const key = ownerImpressionDraftKey(userId, seasonKey);
      if (!Object.keys(next).length) sessionStorage.removeItem(key);
      else {
        const raw = JSON.stringify({ version: 2, ownerId: userId, createdAt: Date.now(), editing: active, inputs: Object.values(next) } satisfies OwnerImpressionDrafts);
        sessionStorage.setItem(key, raw);
        if (sessionStorage.getItem(key) !== raw) throw new Error("draft storage failed");
      }
      setStorageError("");
    } catch { setStorageError("下書きを端末に保持できません。再ログインやページ移動の前に入力を控えてください。"); }
  }

  const items = useMemo(() => {
    const byId = new Map(anime.map((item) => [item.id, item]));
    for (const record of records) if (!byId.has(record.anime.id)) byId.set(record.anime.id, record.anime);
    for (const draft of Object.values(drafts)) if (!byId.has(draft.anime.id)) byId.set(draft.anime.id, draft.anime);
    return [...byId.values()];
  }, [anime, records, drafts]);
  const candidates = useMemo(() => impressionCandidatesForDate(items, airing, selectedDate), [items, airing, selectedDate]);
  const visibleCandidates = candidates.filter(({ anime }) => !dismissed.includes(anime.id));
  const exploration = searchImpressionCatalog(items, records, query, filter, page);
  const writable = !loading && recordsReady && !authRequired && !offline;
  function changeView(next: typeof view) {
    focusView.current = true; setView(next); setMessage(""); setSavedId(null);
    track({ name: "impression_view", view: next, count: records.length });
  }
  function selectDate(next: string) {
    const clamped = clampDateToSeason(next, seasonKey);
    const params = new URLSearchParams(window.location.search);
    params.set("date", clamped);
    history.pushState(history.state, "", `${location.pathname}?${params}${location.hash}`);
    setSelectedDate(clamped);
  }

  function open(item: ImpressionAnime) {
    const record = records.find((entry) => entry.anime.id === item.id);
    const current = draftRef.current;
    keepDrafts(current[item.id] ? current : { ...current, [item.id]: record
      ? { year: record.year, season: record.season, anime: record.anime, revision: record.revision, rating: record.rating, note: record.note, spoiler: record.spoiler }
      : { ...seasonKey, anime: item, revision: deletedRevisions.find((cursor) => cursor.animeId === item.id)?.revision ?? 0, rating: null, note: null, spoiler: "unspecified" } }, item.id);
    setEditing(item.id); setError(""); setConfirmDelete(false);
    track({ name: "impression_edit", source: view });
  }
  function update(change: Partial<ImpressionInput>) {
    if (!editing || pending) return;
    keepDrafts({ ...draftRef.current, [editing]: changeImpressionInput(draftRef.current[editing], change) }, editing);
  }
  async function login() {
    if (!editingInput || busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const draft: ImpressionDraft = { version: 2, ownerId: userId, token: crypto.randomUUID(), createdAt: Date.now(), input: editingInput };
      const raw = JSON.stringify(draft);
      sessionStorage.setItem(IMPRESSION_DRAFT_KEY, raw);
      if (sessionStorage.getItem(IMPRESSION_DRAFT_KEY) !== raw) throw new Error("下書きを保持できません。ブラウザの保存設定を確認してください。");
      await signIn("google", { redirectTo: impressionReturnPath(draft) });
    } catch (failure) { setError(impressionError(failure)); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  function clearAuthDraft() {
    if (!resumeToken) return;
    try {
      const draft = readImpressionDraft(sessionStorage.getItem(IMPRESSION_DRAFT_KEY), resumeToken, userId);
      if (draft?.input.anime.id === editing) sessionStorage.removeItem(IMPRESSION_DRAFT_KEY);
    } catch { /* A stale handoff can only restore input, never submit a write. */ }
  }
  async function save() {
    if (!editingInput || busy.current || loading || readingRecords.current || offline || conflict || impressionNoteLength(editingInput.note ?? "") > 140) return;
    if (!userId || authRequired) { await login(); return; }
    if (!recordsReady) return;
    busy.current = true; setPending(true); setError("");
    recordsVersion.current += 1;
    writingRecords.current = true;
    try {
      const result = await impressionRequest<{ impression: SeasonImpression }>(`/api/season-impressions/${encodeURIComponent(editingInput.anime.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json", "X-Impression-Owner": encodeURIComponent(userId) }, body: JSON.stringify({ ...editingInput, ...seasonKey })
      });
      if (!mounted.current) return;
      setRecords((current) => [...current.filter((entry) => entry.anime.id !== result.impression.anime.id), result.impression]);
      const remaining = { ...draftRef.current }; delete remaining[editingInput.anime.id];
      keepDrafts(remaining, null);
      clearAuthDraft();
      setMessage(impressionGrowthCopy(saved, result.impression, records.length));
      setDismissed((current) => [...current, editingInput.anime.id]);
      setSavedId(result.impression.anime.id); setView("card"); focusView.current = true; setEditing(null);
      track({ name: "impression_save", outcome: "success", operation: saved ? "edit" : "new" });
    } catch (failure) {
      if (!mounted.current) return;
      setError(impressionError(failure));
      if (errorStatus(failure) === 401) setAuthRequired(true);
      const ambiguous = !errorStatus(failure) || errorStatus(failure)! >= 500;
      if (ambiguous || errorStatus(failure) === 409) {
        setReconciliations((current) => ({ ...current, [editingInput.anime.id]: { readVersion: null,
          message: ambiguous ? "保存結果を確認できませんでした。入力を保持しています。最新の記録を確認してください。" : impressionError(failure) } }));
        setError("");
      }
      track({ name: "impression_save", outcome: ambiguous ? "unknown" : errorStatus(failure) === 409 ? "conflict" : "rejected", operation: saved ? "edit" : "new" });
    } finally { writingRecords.current = false; busy.current = false; if (mounted.current) setPending(false); }
  }
  async function remove() {
    if (!editingInput || !saved || !userId || !writable || readingRecords.current || conflict || busy.current) return;
    busy.current = true; setPending(true); setError("");
    recordsVersion.current += 1;
    writingRecords.current = true;
    try {
      const result = await impressionRequest<{ cursor: ImpressionRevisionCursor }>(`/api/season-impressions/${encodeURIComponent(editingInput.anime.id)}`, {
        method: "DELETE", headers: { "Content-Type": "application/json", "X-Impression-Owner": encodeURIComponent(userId) },
        body: JSON.stringify({ ...seasonKey, revision: editingInput.revision })
      });
      if (!mounted.current) return;
      setRecords((current) => current.filter((entry) => entry.anime.id !== editing));
      setDeletedRevisions((current) => [...current.filter((cursor) => cursor.animeId !== result.cursor.animeId), result.cursor]);
      const remaining = { ...draftRef.current }; delete remaining[editingInput.anime.id];
      keepDrafts(remaining, null);
      clearAuthDraft(); setEditing(null); setView("card"); setSavedId(null); focusView.current = true;
      setMessage("記録を削除しました。公開済みの共有は、公開履歴から停止できます。");
      track({ name: "impression_save", outcome: "success", operation: "delete" });
    } catch (failure) {
      if (!mounted.current) return;
      setError(impressionError(failure));
      if (errorStatus(failure) === 401) setAuthRequired(true);
      const ambiguous = !errorStatus(failure) || errorStatus(failure)! >= 500;
      if (ambiguous || errorStatus(failure) === 409) {
        setReconciliations((current) => ({ ...current, [editingInput.anime.id]: { readVersion: null,
          message: ambiguous ? "削除結果を確認できませんでした。最新の記録を確認してください。" : impressionError(failure) } }));
        setError("");
      }
    } finally { writingRecords.current = false; busy.current = false; if (mounted.current) setPending(false); }
  }
  function defer() {
    if (!editingInput || pending) return;
    setDismissed((current) => [...current, editingInput.anime.id]);
    setEditing(null); focusView.current = true;
    setMessage("今回は書かずに戻りました。入力は未保存です。");
    track({ name: "impression_skip" });
  }

  return <>
    {storageError && <p role="alert">{storageError}</p>}
    <p role="status" aria-live="polite">{message}</p>
    {offline && <p role="alert">オフラインです。入力は保持しています。接続後に「保存する」を押してください。</p>}
    {loadError && <div role="alert"><p>{loadError}</p><button type="button" onClick={() => void load()} disabled={loading || pending}>読み込みを再試行</button></div>}
    {warning && <p>{warning}</p>}
    {loading && <p role="status">作品と記録を読み込んでいます…</p>}
    {!sharingActive && <div>
      <h2 ref={viewHeading} tabIndex={-1}>{view === "search" ? "すべての作品から探す" : view === "card" ? "自分の今期カード" : `${selectedDate === jstDateKey(new Date()) ? "今日・" : ""}${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${selectedDate}T12:00:00+09:00`))}の作品`}</h2>
      {view === "entry" && <>
        <nav className="impressions-date-nav" aria-label="放送日を選ぶ">
          <button type="button" aria-label="前日" disabled={selectedDate === seasonStart} onClick={() => selectDate(shiftDateKey(selectedDate, -1)!)}>‹</button>
          <div className="impressions-week">{impressionWeek(selectedDate).map((date) => { const day = new Date(`${date}T12:00:00+09:00`); const today = date === jstDateKey(new Date()); const outside = date < seasonStart || date > seasonEnd; return <button type="button" key={date} disabled={outside} aria-current={date === selectedDate ? "date" : undefined} onClick={() => selectDate(date)}><span>{today ? "今日" : new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(day)}</span><strong>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" }).format(day)}</strong></button>; })}</div>
          <button type="button" aria-label="翌日" disabled={selectedDate === seasonEnd} onClick={() => selectDate(shiftDateKey(selectedDate, 1)!)}>›</button>
        </nav>
        <p className="impressions-reference">放送時刻は取得済みの実時刻（参考）です。</p>
        {!loading && recordsReady && items.length > 0 && items.every((item) => records.some((record) => record.anime.id === item.id)) && <p>すべての作品を記録済みです。今の一言を書き直すこともできます。</p>}
        <ul className="impressions-list" aria-label="一言を書く候補">
          {visibleCandidates.map(({ anime: item, airingAt }) => <li key={item.id}>
            <button type="button" className="impressions-card" disabled={!recordsReady || authRequired} onClick={() => open(item)}>
              <ImpressionArtwork anime={item} /><span className="impressions-card-text"><strong>{item.title}</strong>
                <span className="impressions-meta">{drafts[item.id] ? "書きかけ" : records.some((record) => record.anime.id === item.id) ? "記録済み" : "未記録"}</span>
                <span className="impressions-time">{impressionAiringLabel(airingAt)}</span>
              </span>
            </button>
          </li>)}
        </ul>
        {!loading && recordsReady && !visibleCandidates.length && items.length > 0 && <div className="impressions-empty"><p>この日に時刻が確認できる作品はありません。</p><div className="impressions-actions"><button type="button" disabled={selectedDate === seasonStart} onClick={() => selectDate(shiftDateKey(selectedDate, -1)!)}>前日の作品</button><button type="button" disabled={selectedDate === seasonEnd} onClick={() => selectDate(shiftDateKey(selectedDate, 1)!)}>翌日の作品</button></div></div>}
        <div className="impressions-actions impressions-entry-actions"><button type="button" onClick={() => changeView("search")}>作品を探す</button>
          <button type="button" onClick={() => changeView("card")}>自分の今期カードを見る</button></div>
      </>}
      {!loading && !items.length && <p>このクールの作品はまだ表示できません。別のクールを選ぶか再試行してください。</p>}
      {view === "search" && <section aria-label="作品の検索・選択">
        <label className="impressions-search">作品名で検索<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        <div className="impressions-actions" aria-label="記録の絞り込み">
          {([['all', 'すべて'], ['unchecked', '未記録'], ['saved', '記録済み']] as const).map(([value, label]) =>
            <button type="button" key={value} aria-pressed={filter === value} disabled={value !== "all" && !recordsReady} onClick={() => { setFilter(value); setPage(0); }}>{label}</button>)}
        </div>
        {!loading && !exploration.total && <p role="status">条件に合う作品がありません。検索語や絞り込みを変えてください。</p>}
        <ul className="impressions-list" aria-label="検索結果">{exploration.items.map((item) => {
          const record = records.find((entry) => entry.anime.id === item.id);
          return <li key={item.id}><button type="button" className={`impressions-card${record ? " impressions-card--checked" : ""}`} disabled={!recordsReady || authRequired} onClick={() => open(item)}>
            <ImpressionArtwork anime={item} /><span className="impressions-card-text"><strong>{item.title}</strong>
              {record?.note && <span className="impressions-note">{record.note}</span>}
              {record?.rating && <span className="impressions-meta">今の印象：{IMPRESSION_RATING_LABELS[record.rating]}</span>}
              <span className="impressions-meta">{!recordsReady ? "記録を確認できません" : record ? "記録済み・編集" : "未記録"}</span>
            </span></button></li>;
        })}</ul>
        <div className="impressions-actions">
          {page > 0 && <button type="button" onClick={() => setPage(page - 1)}>前の10作品</button>}
          {(page + 1) * 10 < exploration.total && <button type="button" onClick={() => setPage(page + 1)}>次の10作品</button>}
          <button type="button" onClick={() => changeView("entry")}>候補に戻る</button>
          <button type="button" onClick={() => changeView("card")}>自分の今期カードを見る</button>
        </div>
      </section>}
      {view === "card" && <ImpressionSeasonCard seasonKey={seasonKey} records={records} ready={recordsReady && !authRequired} savedId={savedId} onEdit={open}>
        <div className="impressions-actions"><button type="button" onClick={() => changeView("entry")}>次の作品に一言</button>
          <button type="button" onClick={() => { setSavedId(null); setMessage("今日はここまで。今期カードは、またここで見返せます。"); }}>今日はここまで</button></div>
      </ImpressionSeasonCard>}
    </div>}
    {!userId && <p>閲覧・入力できます。記録の保存にはGoogleログインが必要です。</p>}
    {(!userId || authRequired) && <div><p>ログイン中に入力した下書きは、元のアカウントで再ログインすると復元できます。</p>
      <button type="button" disabled={pending} onClick={() => {
        void signIn("google", { redirectTo: `/tier/impressions?year=${seasonKey.year}&season=${seasonKey.season}` })
          .catch((failure) => setStorageError(impressionError(failure)));
      }}>元のアカウントで再ログイン</button></div>}
    {userId && <ImpressionSharing userId={userId} seasonKey={seasonKey} records={records} reloadRecords={readRecords}
      recordsReady={recordsReady && !loading && !pending && !authRequired} hasDrafts={Object.keys(drafts).length > 0} entryVisible={view === "card"} offline={offline} onReturn={() => changeView("card")} />}
    <BottomSheet open={!!editingInput} onOpenChange={(openState) => { if (!openState && !busy.current) setEditing(null); }}
      title={editingInput?.anime.title} initialFocusRef={noteRef} className="impressions-sheet">
      {editingInput && <form ref={editorRef} className="impressions-editor" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="impression-note">いまの一言</label>
        <textarea ref={noteRef} id="impression-note" rows={3} value={editingInput.note ?? ""} disabled={pending}
          placeholder="好きだった場面、気になったこと。ひとことだけでも。"
          aria-describedby="impression-note-count impression-note-privacy" aria-invalid={impressionNoteLength(editingInput.note ?? "") > 140}
          onChange={(event) => update({ note: event.target.value || null })} />
        <span id="impression-note-count">{impressionNoteLength(editingInput.note ?? "")} / 140文字（任意）</span>
        {impressionNoteLength(editingInput.note ?? "") > 140 && <p role="alert">140文字以内にしてください。入力は保持しています。</p>}
        {editingInput.note && <label className="impressions-spoiler"><input type="checkbox" checked={editingInput.spoiler === "no_spoiler"} disabled={pending}
          onChange={(event) => update({ spoiler: event.target.checked ? "no_spoiler" : "unspecified" })} />ネタバレなし（共有時に選べます）</label>}
        <p id="impression-note-privacy">一言は非公開で保存します。共有時に選択した「ネタバレなし」の一言だけ公開できます。</p>
        <details key={editing} className="impressions-rating-disclosure"><summary>評価を添える（任意）</summary>
          <fieldset className="impressions-rating" disabled={pending}><legend>今の印象（任意）</legend>
            {IMPRESSION_RATINGS.map((rating) => <label key={rating} data-selected={editingInput.rating === rating}>
              <input type="radio" name="rating" checked={editingInput.rating === rating} onChange={() => update({ rating })} />{IMPRESSION_RATING_LABELS[rating]}</label>)}
            <label data-selected={editingInput.rating === null}><input type="radio" name="rating" checked={editingInput.rating === null} onChange={() => update({ rating: null })} />評価なし</label>
          </fieldset>
        </details>
        <div className="impressions-editor-context"><ImpressionArtwork anime={editingInput.anime} />
          <p>{saved ? "記録済み・編集中" : "未記録・入力中"}。未保存の入力です。「保存する」で確定します。</p></div>
        {(error || reconciliation) && <p role="alert">{error || reconciliation?.message}</p>}
        {conflict && <div className="impressions-conflict">
          <button type="button" disabled={pending || offline} onClick={async () => {
            if (busy.current) return; busy.current = true; setPending(true);
            try {
              await readRecords();
              if (mounted.current) {
                setReconciliations((current) => ({ ...current, [editingInput.anime.id]: { ...current[editingInput.anime.id], readVersion: recordsVersion.current } }));
                setError("");
              }
            } catch (failure) { if (mounted.current) setError(impressionError(failure)); }
            finally { busy.current = false; if (mounted.current) setPending(false); }
          }}>入力を保持して最新の記録を確認</button>
          {latestLoaded && <><p>最新の記録：{saved ? `${saved.rating ? IMPRESSION_RATING_LABELS[saved.rating] : "評価なし"}／${saved.note ?? "一言なし"}` : "保存された記録はありません"}</p>
            <button type="button" disabled={pending || !writable} onClick={() => {
              if (busy.current || readingRecords.current || !writable || !latestLoaded) return;
              update({ revision: saved?.revision ?? deletedRevisions.find((cursor) => cursor.animeId === editing)?.revision ?? 0 });
              setReconciliations((current) => { const next = { ...current }; delete next[editingInput.anime.id]; return next; });
              setError(""); setConfirmDelete(false);
            }}>現在の入力で編集を続ける</button></>}
        </div>}
        <div className="impressions-actions">
          <button type="button" onClick={defer} disabled={pending}>今回は書かない</button>
          {saved && !confirmDelete && <button type="button" disabled={pending || conflict || !writable} onClick={() => setConfirmDelete(true)}>記録を削除</button>}
          {saved && confirmDelete && <><p>この作品の記録を削除します。公開済みURLは停止されません。</p>
            <button type="button" disabled={pending || conflict || !writable} onClick={() => void remove()}>削除を確定する</button><button type="button" disabled={pending} onClick={() => setConfirmDelete(false)}>キャンセル</button></>}
        </div>
        <div className="impressions-actions impressions-save-actions">
          <button type="button" onClick={() => void save()} className="impressions-primary" disabled={pending || loading || offline || conflict || (!recordsReady && !authRequired) || impressionNoteLength(editingInput.note ?? "") > 140}>
            {pending ? "処理中…" : !userId || authRequired ? "Googleでログインして保存へ" : !saved && !editingInput.note && !editingInput.rating ? "確認だけ記録する" : "保存する"}
          </button>
        </div>
      </form>}
    </BottomSheet>
  </>;
}
