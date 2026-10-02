"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type RefObject } from "react";
import { signIn, useSession } from "next-auth/react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DisplayModeToggle } from "@/components/display-mode/DisplayModeToggle";
import { ImpressionArtwork } from "@/components/ImpressionSnapshotView";
import { SeasonContextControl } from "@/components/SeasonContextControl";
import { useSeasonUrlState } from "@/components/useSeasonUrlState";
import { seasonHeadingJa } from "@/lib/season";
import { fetchSeasonalAnimeClient } from "@/lib/seasonal-anime-client-cache";
import { IMPRESSION_DRAFT_KEY, readImpressionDraft, impressionReturnPath, ownerImpressionDraftKey, readOwnerImpressionDrafts,
  type ImpressionDraft, type OwnerImpressionDrafts } from "@/lib/season-impression-draft";
import { IMPRESSION_RATINGS, IMPRESSION_RATING_LABELS, impressionNoteLength, readImpressionAnime,
  type ImpressionAnime, type ImpressionInput, type ImpressionSeason, type ImpressionSeasonState, type ImpressionRevisionCursor, type SeasonImpression } from "@/lib/season-impressions-model";
import { ImpressionSharing } from "./impression-sharing";
import { impressionError, impressionRequest } from "./impressions-request";

type Props = { seasonKey: ImpressionSeason; resumeToken: string | null };

function errorStatus(error: unknown): number | undefined {
  return error instanceof Error ? (error as Error & { status?: number }).status : undefined;
}
export function ImpressionsClient(props: Props) {
  const { ref, explicit, setRef } = useSeasonUrlState(props.seasonKey);
  const [pending, setPending] = useState(false);
  const canChangeSeason = useRef(() => true);
  const { data: session, status } = useSession();
  if (status === "loading") return <div className="impressions-page" role="status">今期チェックを準備しています…</div>;
  const userId = status === "authenticated" ? (session?.user as { id?: string } | undefined)?.id ?? null : null;
  return <div className="impressions-page">
    <h1>今期チェック</h1>
    <p>作品を確認して、今の印象を残しましょう。確認は視聴完了を表すものではありません。</p>
    <SeasonContextControl value={ref} explicit={explicit} disabled={pending} onChange={(next) => {
      if (!canChangeSeason.current()) return false;
      setRef(next);
    }} />
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
  const [deferred, setDeferred] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [latestLoaded, setLatestLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const editorRef = useRef<HTMLFormElement>(null);
  const requestVersion = useRef(0);
  const recordsVersion = useRef(0);
  const editingInput = editing ? drafts[editing] : undefined;
  const saved = records.find((record) => record.anime.id === editing);

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
    const version = ++recordsVersion.current;
    const result = await impressionRequest<ImpressionSeasonState>(`/api/season-impressions?year=${seasonKey.year}&season=${seasonKey.season}`, {
      headers: { "X-Impression-Owner": encodeURIComponent(userId) }
    });
    if (mounted.current && version === recordsVersion.current) { setRecords(result.impressions); setDeletedRevisions(result.deletedRevisions); setRecordsReady(true); setAuthRequired(false); }
    return result.impressions;
  }, [userId, seasonKey.year, seasonKey.season]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError("");
    const results = await Promise.allSettled([fetchSeasonalAnimeClient(seasonKey.year, seasonKey.season), readRecords()]);
    if (!mounted.current || version !== requestVersion.current) return;
    const failures: string[] = [];
    if (results[0].status === "fulfilled") {
      setAnime(results[0].value.items.map(readImpressionAnime).filter((item): item is ImpressionAnime => item !== null));
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
    if (!userId || !recordsReady) return;
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
      setDrafts(inputs); setEditing(active);
      if (Object.keys(inputs).length) setMessage("このアカウントの未保存の入力を復元しました。内容を確認して保存してください。");
      else if (resumeToken) setMessage("このアカウントで復元できる下書きはありません。元のアカウントでログインしてください。");
    } catch { setStorageError("下書きを読み込めませんでした。ブラウザの保存設定を確認してください。"); }
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
  const unchecked = useMemo(() => items.filter((item) => !records.some((record) => record.anime.id === item.id))
    .sort((a, b) => (deferred.indexOf(a.id) + 1) - (deferred.indexOf(b.id) + 1)), [items, records, deferred]);

  function open(item: ImpressionAnime) {
    const record = records.find((entry) => entry.anime.id === item.id);
    const current = draftRef.current;
    keepDrafts(current[item.id] ? current : { ...current, [item.id]: record
      ? { year: record.year, season: record.season, anime: record.anime, revision: record.revision, rating: record.rating, note: record.note, spoiler: record.spoiler }
      : { ...seasonKey, anime: item, revision: deletedRevisions.find((cursor) => cursor.animeId === item.id)?.revision ?? 0, rating: null, note: null, spoiler: "unspecified" } }, item.id);
    setEditing(item.id); setError(""); setConflict(false); setLatestLoaded(false); setConfirmDelete(false); setAuthRequired(false);
  }
  function update(change: Partial<ImpressionInput>) {
    if (!editing || pending) return;
    keepDrafts({ ...draftRef.current, [editing]: { ...draftRef.current[editing], ...change } }, editing);
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
    if (!editingInput || busy.current) return;
    if (!userId || authRequired) { await login(); return; }
    busy.current = true; setPending(true); setError("");
    try {
      const result = await impressionRequest<{ impression: SeasonImpression }>(`/api/season-impressions/${encodeURIComponent(editingInput.anime.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json", "X-Impression-Owner": encodeURIComponent(userId) }, body: JSON.stringify({ ...editingInput, ...seasonKey })
      });
      if (!mounted.current) return;
      setRecords((current) => [...current.filter((entry) => entry.anime.id !== result.impression.anime.id), result.impression]);
      const remaining = { ...draftRef.current }; delete remaining[editingInput.anime.id];
      keepDrafts(remaining, null);
      clearAuthDraft();
      setMessage(`${editingInput.anime.title} の今の印象を保存しました。`);
      const next = unchecked.find((item) => item.id !== editingInput.anime.id);
      if (next) open(next); else setEditing(null);
    } catch (failure) {
      if (!mounted.current) return;
      setError(impressionError(failure));
      if (errorStatus(failure) === 409) { setConflict(true); setLatestLoaded(false); }
      if (errorStatus(failure) === 401) setAuthRequired(true);
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  async function remove() {
    if (!editingInput || !saved || !userId || authRequired || busy.current) return;
    busy.current = true; setPending(true); setError("");
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
      clearAuthDraft(); setEditing(null); setMessage("確認記録を削除しました。公開済みの共有は、公開履歴から停止できます。");
    } catch (failure) {
      if (!mounted.current) return;
      setError(impressionError(failure));
      if (errorStatus(failure) === 409) { setConflict(true); setLatestLoaded(false); }
      if (errorStatus(failure) === 401) setAuthRequired(true);
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  function defer() {
    if (!editingInput || pending) return;
    setDeferred((current) => [...current.filter((id) => id !== editing), editingInput.anime.id]);
    const next = unchecked.find((item) => item.id !== editing);
    if (next) open(next); else setEditing(null);
    setMessage("保存せず、このセッションの後ろへ回しました。");
  }

  return <>
    <DisplayModeToggle />
    {!userId && <p>閲覧・入力できます。記録の保存にはGoogleログインが必要です。</p>}
    {(!userId || authRequired) && <div><p>ログイン中に入力した下書きは、元のアカウントで再ログインすると復元できます。</p>
      <button type="button" disabled={pending} onClick={() => {
        void signIn("google", { redirectTo: `/tier/impressions?year=${seasonKey.year}&season=${seasonKey.season}` })
          .catch((failure) => setStorageError(impressionError(failure)));
      }}>元のアカウントで再ログイン</button></div>}
    {storageError && <p role="alert">{storageError}</p>}
    <p role="status" aria-live="polite">{message || `${seasonHeadingJa(seasonKey)}：${records.length}作品を確認済み`}</p>
    {loadError && <div role="alert"><p>{loadError}</p><button type="button" onClick={() => void load()} disabled={loading}>読み込みを再試行</button></div>}
    {warning && <p>{warning}</p>}
    {loading && <p role="status">作品と記録を読み込んでいます…</p>}
    {unchecked.length > 0 && <button className="impressions-primary" type="button" disabled={!recordsReady} onClick={() => open(unchecked[0])}>続きから確認する</button>}
    {!loading && !items.length && <p>このクールの作品はまだ表示できません。別のクールを選ぶか再試行してください。</p>}
    <ul className="impressions-list">
      {[...unchecked, ...items.filter((item) => records.some((record) => record.anime.id === item.id))].map((item) => {
        const record = records.find((entry) => entry.anime.id === item.id);
        return <li key={item.id}><button type="button" className={`impressions-card${record ? " impressions-card--checked" : ""}`}
          disabled={!recordsReady} onClick={() => open(item)}>
          <ImpressionArtwork anime={item} />
          <span className="impressions-card-text"><strong>{item.title}</strong>
            <span>{record ? "✓ 確認済み・編集" : "未確認・入力"}</span>
            {record?.rating && <span>今の印象：{IMPRESSION_RATING_LABELS[record.rating]}</span>}
          </span>
        </button></li>;
      })}
    </ul>
    {userId && <ImpressionSharing key={`${seasonKey.year}:${seasonKey.season}`} userId={userId} seasonKey={seasonKey} records={records} reloadRecords={readRecords} />}
    <BottomSheet open={!!editingInput} onOpenChange={(openState) => { if (!openState && !busy.current) setEditing(null); }}
      title={editingInput?.anime.title} description="確認のみでも保存できます。入力は「保存して次へ」で確定します。" className="impressions-sheet">
      {editingInput && <form ref={editorRef} className="impressions-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={pending}><legend>今の印象（任意）</legend>
          <label><input type="radio" name="rating" checked={editingInput.rating === null} onChange={() => update({ rating: null })} />評価なし・確認のみ</label>
          {IMPRESSION_RATINGS.map((rating) => <label key={rating}><input type="radio" name="rating" checked={editingInput.rating === rating} onChange={() => update({ rating })} />{IMPRESSION_RATING_LABELS[rating]}</label>)}
        </fieldset>
        <label htmlFor="impression-note">一言（任意・140文字以内）</label>
        <textarea id="impression-note" rows={3} value={editingInput.note ?? ""} disabled={pending}
          aria-describedby="impression-note-count" aria-invalid={impressionNoteLength(editingInput.note ?? "") > 140}
          onChange={(event) => update({ note: event.target.value || null })} />
        <span id="impression-note-count">{impressionNoteLength(editingInput.note ?? "")} / 140文字</span>
        <label htmlFor="impression-spoiler">ネタバレ区分</label>
        <select id="impression-spoiler" value={editingInput.spoiler} disabled={pending} onChange={(event) => update({ spoiler: event.target.value as ImpressionInput["spoiler"] })}>
          <option value="unspecified">未指定（本文は公開しない）</option><option value="no_spoiler">ネタバレなし</option><option value="has_spoiler">ネタバレあり（本文は公開しない）</option>
        </select>
        <p>一言は非公開で保存します。共有時に選択した「ネタバレなし」の一言だけ公開できます。</p>
        {error && <p role="alert">{error}</p>}
        {conflict && <div className="impressions-conflict">
          <button type="button" disabled={pending} onClick={async () => {
            setPending(true);
            try { await readRecords(); setLatestLoaded(true); } catch (failure) { setError(impressionError(failure)); }
            finally { setPending(false); }
          }}>入力を保持して最新の記録を確認</button>
          {latestLoaded && <><p>最新の記録：{saved ? `${saved.rating ? IMPRESSION_RATING_LABELS[saved.rating] : "評価なし"}／${saved.note ?? "一言なし"}` : "保存された記録はありません"}</p>
            <button type="button" onClick={() => { update({ revision: saved?.revision ?? deletedRevisions.find((cursor) => cursor.animeId === editing)?.revision ?? 0 }); setConflict(false); setError(""); setConfirmDelete(false); }}>現在の入力で編集を続ける</button></>}
        </div>}
        <div className="impressions-actions">
          <button type="submit" className="impressions-primary" disabled={pending || conflict || (!recordsReady && !authRequired) || impressionNoteLength(editingInput.note ?? "") > 140}>
            {pending ? "処理中…" : !userId || authRequired ? "Googleでログインして保存へ" : error ? "再試行して保存" : "保存して次へ"}
          </button>
          <button type="button" onClick={defer} disabled={pending}>あとで（保存しない）</button>
          {saved && !confirmDelete && <button type="button" disabled={pending || conflict} onClick={() => setConfirmDelete(true)}>確認記録を削除</button>}
          {saved && confirmDelete && <><p>この作品の確認記録を削除します。公開済みURLは停止されません。</p>
            <button type="button" disabled={pending || conflict} onClick={() => void remove()}>削除を確定する</button><button type="button" disabled={pending} onClick={() => setConfirmDelete(false)}>キャンセル</button></>}
        </div>
      </form>}
    </BottomSheet>
  </>;
}
