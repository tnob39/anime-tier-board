"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ImpressionSnapshotView } from "@/components/ImpressionSnapshotView";
import { buildImpressionSnapshot, type ImpressionSeason, type SeasonImpression, type ImpressionSelection,
  type ImpressionShareHistory, type ImpressionShareInput, type ImpressionSnapshot } from "@/lib/season-impressions-model";
import { seasonHeadingJa } from "@/lib/season";
import { resolveSeasonQuery } from "@/lib/season-url";
import { impressionError, impressionRequest } from "./impressions-request";
import { IMPRESSION_SHARE_INITIAL_LIMIT, sortImpressionRecords } from "@/lib/season-impressions-view";
import { track } from "@/lib/analytics";
import { BottomSheet } from "@/components/ui/BottomSheet";

type Step = "select" | "result" | "manage";
const steps: Step[] = ["select", "result", "manage"];
function statusOf(error: unknown) { return error instanceof Error ? (error as Error & { status?: number }).status : undefined; }

export function ImpressionSharing({ userId, seasonKey, records, reloadRecords, recordsReady, hasDrafts, entryVisible, offline, onReturn }: {
  userId: string; seasonKey: ImpressionSeason; records: SeasonImpression[]; reloadRecords: () => Promise<SeasonImpression[]>;
  recordsReady: boolean; hasDrafts: boolean; entryVisible: boolean; offline: boolean; onReturn: () => void;
}) {
  const requestedStep = useSearchParams().get("share");
  const [selections, setSelections] = useState<Record<string, ImpressionSelection>>({});
  const [preview, setPreview] = useState<{ input: ImpressionShareInput; snapshot: ImpressionSnapshot } | null>(null);
  const [shares, setShares] = useState<ImpressionShareHistory[]>([]);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyState, setHistoryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [pending, setPending] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [lastOperation, setLastOperation] = useState<"created" | "updated" | "existing">("created");
  const [canonicalTarget, setCanonicalTarget] = useState<{ shareId: string; updatedAt: string } | null>(null);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [unknownResult, setUnknownResult] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [confirmStop, setConfirmStop] = useState<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const historyVersion = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const receipt = useRef<HTMLButtonElement>(null);
  const entry = useRef<HTMLButtonElement>(null);
  const previousStep = useRef<Step | null>(null);
  const initialized = useRef(false);
  const step = steps.includes(requestedStep as Step) ? requestedStep as Step : null;
  // URLs hold only steps and seasons. Private selections and receipts stay in this owner/season mount.
  const validStep = step === "result" && !createdId ? "manage" : step;
  const navigate = useCallback((next: Step | null, replace = false) => {
    const url = new URL(window.location.href);
    const liveSeason = resolveSeasonQuery(url.searchParams).ref;
    if (liveSeason.year !== seasonKey.year || liveSeason.season !== seasonKey.season) return;
    url.searchParams.set("year", String(seasonKey.year));
    url.searchParams.set("season", seasonKey.season);
    url.searchParams.delete("resume");
    if (next) url.searchParams.set("share", next); else url.searchParams.delete("share");
    window.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [seasonKey.year, seasonKey.season]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const explicit = resolveSeasonQuery(new URLSearchParams(window.location.search)).explicit;
    if (step !== validStep || (requestedStep && !step) || (validStep && !explicit)) navigate(validStep, true);
  }, [step, validStep, requestedStep, navigate]);
  useEffect(() => {
    if (validStep === "result") receipt.current?.focus();
    else if (validStep) heading.current?.focus();
    else if (previousStep.current) entry.current?.focus();
    previousStep.current = validStep;
  }, [validStep]);
  useEffect(() => {
    if (validStep !== "select") return;
    setSelections((current) => Object.fromEntries(Object.entries(current).map(([animeId, selection]) => [animeId, {
      ...selection, includeNote: false, includeRating: false
    }])));
  }, [validStep]);
  useEffect(() => {
    if (validStep === "select" && recordsReady && !initialized.current) {
      initialized.current = true;
      setSelections(Object.fromEntries(sortImpressionRecords(records).slice(0, IMPRESSION_SHARE_INITIAL_LIMIT).map((record) => [record.anime.id,
        { animeId: record.anime.id, revision: record.revision, includeNote: false, includeRating: false }])));
    }
  }, [validStep, recordsReady, records]);

  function requireLogin() {
    setAuthRequired(true); setSelections({}); setPreview(null); setCreatedId(null); setShares([]);
    setConfirmStop(null); setError(""); setMessage(""); setHistoryError("");
  }
  const loadHistory = useCallback(async () => {
    const version = ++historyVersion.current;
    setHistoryState("loading"); setHistoryError("");
    try {
      const result = await impressionRequest<{ shares: ImpressionShareHistory[] }>("/api/shares?kind=season-impressions", { headers: { "X-Impression-Owner": encodeURIComponent(userId) } });
      if (mounted.current && version === historyVersion.current) { setShares(result.shares); setHistoryState("ready"); }
    } catch (failure) {
      if (!mounted.current || version !== historyVersion.current) return;
      setHistoryState("error"); setHistoryError(impressionError(failure));
      if (statusOf(failure) === 401) requireLogin();
    }
  }, [userId]);
  useEffect(() => {
    if (validStep === "manage" && !authRequired) void loadHistory();
    return () => { historyVersion.current += 1; };
  }, [validStep, authRequired, loadHistory]);

  function selectRecords(selected: SeasonImpression[]) {
    initialized.current = true;
    setSelections(Object.fromEntries(selected.map((record) => [record.anime.id, {
      animeId: record.anime.id, revision: record.revision, includeRating: false, includeNote: false
    }])));
    setPreview(null); setCreatedId(null); setError(""); setMessage(""); setConflict(false);
  }
  async function start() {
    if (busy.current || !recordsReady || unknownResult) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await impressionRequest<{ shares: ImpressionShareHistory[] }>("/api/shares?kind=season-impressions", { headers: { "X-Impression-Owner": encodeURIComponent(userId) } });
      if (!mounted.current) return;
      const target = result.shares.find((share) => share.canonical && share.year === seasonKey.year && share.season === seasonKey.season);
      setCanonicalTarget(target ? { shareId: target.shareId, updatedAt: target.updatedAt } : null);
      selectRecords(sortImpressionRecords(records).slice(0, IMPRESSION_SHARE_INITIAL_LIMIT)); navigate("select");
      track({ name: "impression_share", action: "select", count: Math.min(records.length, IMPRESSION_SHARE_INITIAL_LIMIT) });
    } catch (failure) {
      if (mounted.current) { setError(impressionError(failure)); if (statusOf(failure) === 401) requireLogin(); }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  function startUpdate(share: ImpressionShareHistory) {
    if (share.year !== seasonKey.year || share.season !== seasonKey.season) return;
    if (!share.canonical) return;
    setCanonicalTarget({ shareId: share.shareId, updatedAt: share.updatedAt });
    selectRecords(sortImpressionRecords(records).slice(0, IMPRESSION_SHARE_INITIAL_LIMIT));
    navigate("select");
  }
  function change(record: SeasonImpression, field: "selected" | "includeNote" | "includeRating", value: boolean) {
    setPreview(null); setCreatedId(null); setError("");
    setSelections((current) => {
      const copy = { ...current };
      if (field === "selected" && !value) delete copy[record.anime.id];
      else copy[record.anime.id] = { ...(copy[record.anime.id] ?? { animeId: record.anime.id, revision: record.revision,
        includeRating: false, includeNote: false }), ...(field !== "selected" ? { [field]: value } : {}) };
      return copy;
    });
  }
  function composeProjection() {
    if (!recordsReady) return null;
    const input: ImpressionShareInput = { kind: "season-impressions", ...seasonKey, selections: Object.values(selections) };
    if (!input.selections.length) return null;
    const snapshot = buildImpressionSnapshot(input, records);
    return snapshot ? { input, snapshot } : null;
  }
  const projection = useMemo(composeProjection, [recordsReady, seasonKey, selections, records]);
  async function refreshSelection() {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try {
      const [latest, history] = await Promise.all([
        reloadRecords(),
        impressionRequest<{ shares: ImpressionShareHistory[] }>("/api/shares?kind=season-impressions", {
          headers: { "X-Impression-Owner": encodeURIComponent(userId) }
        })
      ]);
      if (!mounted.current) return;
      const target = history.shares.find((share) => share.canonical && share.year === seasonKey.year && share.season === seasonKey.season);
      setCanonicalTarget(target ? { shareId: target.shareId, updatedAt: target.updatedAt } : null);
      setSelections((current) => Object.fromEntries(latest.flatMap((record) => {
        const selection = current[record.anime.id];
        return selection ? [[record.anime.id, { ...selection, revision: record.revision,
          includeNote: false, includeRating: false }]] : [];
      })));
      setPreview(null); setConflict(false); setError("");
      setMessage("最新の記録と共有状態を読み込みました。メモと評価は非公開に戻しました。もう一度公開内容を選んでください。");
      navigate("select", true);
    } catch (failure) {
      if (mounted.current) { setError(impressionError(failure)); if (statusOf(failure) === 401) requireLogin(); }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  async function publish() {
    if (!projection || busy.current || createdId || unknownResult || conflict || authRequired || !recordsReady || offline) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await impressionRequest<{ shareId: string; operation: "created" | "updated" | "existing"; updatedAt: string }>("/api/shares", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Impression-Owner": encodeURIComponent(userId) },
        body: JSON.stringify({ ...projection.input, targetShareId: canonicalTarget?.shareId ?? null, expectedUpdatedAt: canonicalTarget?.updatedAt ?? null })
      });
      if (!mounted.current) return;
      if (typeof result.shareId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(result.shareId)
        || !["created", "updated", "existing"].includes(result.operation) || typeof result.updatedAt !== "string") throw new Error("unknown result");
      setCreatedId(result.shareId); setLastOperation(result.operation); setCanonicalTarget({ shareId: result.shareId, updatedAt: result.updatedAt });
      setMessage(result.operation === "created" ? "共有URLを作成しました。" : result.operation === "updated" ? "同じ共有URLの公開内容を更新しました。" : "同じ共有URLがすでに公開されています。内容を確認してから更新してください。");
      navigate("result");
      track({ name: "impression_share", action: "published", count: projection.input.selections.length });
    } catch (failure) {
      if (!mounted.current) return;
      const status = statusOf(failure);
      if (status === 401) requireLogin();
      else if (status === 409) {
        setSelections((current) => Object.fromEntries(Object.entries(current).map(([animeId, selection]) => [animeId, {
          ...selection, includeNote: false, includeRating: false
        }])));
        setPreview(null);
        setConflict(true);
        setError("記録が変更または削除されています。最新の記録を確認してから公開してください。");
      }
      else if (status === 429) setError("共有の作成が混み合っています。しばらく待ってから、もう一度公開してください。");
      else if (status && status >= 400 && status < 500) setError(impressionError(failure));
      else { setUnknownResult(true); setError("公開結果を確認できませんでした。重複作成を避けるため、共有の管理・履歴で作成済みのURLを確認してください。"); }
      track({ name: "impression_share", action: status && status < 500 ? "rejected" : "unknown", count: projection.input.selections.length });
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  async function stop(shareId: string) {
    if (busy.current || confirmStop !== shareId || offline) return;
    busy.current = true; setPending(true); setHistoryError("");
    try {
      await impressionRequest(`/api/shares/${shareId}`, { method: "DELETE", headers: { "X-Impression-Owner": encodeURIComponent(userId) } });
      if (!mounted.current) return;
      setShares((current) => current.filter((share) => share.shareId !== shareId)); setConfirmStop(null);
      if (createdId === shareId) { setCreatedId(null); setPreview(null); }
      setMessage("公開を停止しました。このURLからは取得できません。");
      track({ name: "impression_share", action: "revoked", count: 1 });
    } catch (failure) {
      if (mounted.current) { setHistoryError(impressionError(failure)); if (statusOf(failure) === 401) requireLogin(); }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  async function copy(shareId: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/impressions/${shareId}`);
      if (mounted.current) setMessage("共有URLをコピーしました。");
    } catch { if (mounted.current) setMessage("コピーできませんでした。共有リンクを開いてURLをコピーしてください。"); }
  }
  async function shareNative(shareId: string) {
    const url = `${window.location.origin}/share/impressions/${shareId}`;
    if (!navigator.share) { await copy(shareId); return; }
    try { await navigator.share({ title: `${seasonHeadingJa(seasonKey)} 今期チェック`, url }); }
    catch (failure) { if ((failure as Error)?.name !== "AbortError" && mounted.current) setMessage("共有できませんでした。URLをコピーして共有してください。"); }
  }

  return <section className="impressions-sharing" aria-labelledby="impressions-sharing-title" hidden={!validStep && !entryVisible}>
    <h2 id="impressions-sharing-title" ref={heading} tabIndex={-1}>{validStep === "manage" ? "共有の管理・履歴" : "今の保存済み記録を共有"}</h2>
    <p>{seasonHeadingJa(seasonKey)}・保存済み {recordsReady ? records.length : "—"}作品</p>
    {hasDrafts && <p>未保存の入力は共有に含まれません。</p>}
    {authRequired ? <div role="alert"><p>ログインを確認できません。元のアカウントでログインし直して、保存済みの記録から選び直してください。</p>
      <button type="button" onClick={() => void signIn("google", { redirectTo: `/tier/impressions?year=${seasonKey.year}&season=${seasonKey.season}&share=select` }).catch((failure) => setError(impressionError(failure)))}>Googleでログインし直す</button>
      {error && <p>{error}</p>}
    </div> : <>
      {!validStep && <><div className="impressions-actions">
        <button ref={entry} type="button" className="impressions-primary" disabled={!recordsReady || !records.length || pending || unknownResult} onClick={start}>今の{records.length}作品を共有</button>
        <button type="button" onClick={() => navigate("manage")}>共有の管理・履歴</button>
      </div>{!recordsReady ? <p>保存済みの記録を確認してから共有できます。</p> : !records.length && <p>まず1作品を保存すると共有できます。</p>}</>}
      <BottomSheet open={validStep === "select" || validStep === "result"} onOpenChange={(open) => {
        if (!open) { selectRecords(Object.values(selections).flatMap((selection) => records.find((record) => record.anime.id === selection.animeId) ?? [])); onReturn(); navigate(null); }
      }} title={validStep === "result" ? "共有しました" : canonicalTarget ? "共有を更新" : "今期チェックを共有"}
        description={validStep === "result" ? "URLをコピーするか、そのまま共有できます。" : "保存済みの内容だけを公開します。"}
        initialFocusRef={validStep === "result" ? receipt : undefined} className="impressions-share-sheet">
        {validStep === "select" && <div className="impressions-share-compose">
          <div className="impressions-share-notices"><strong>保存済みの内容だけ</strong><span>未保存入力は含まれない</span>{canonicalTarget && <span>既存URLを更新</span>}</div>
          <p>最近保存した最大6作品を選んでいます。作品を外したり、公開する一言・評価を追加できます。</p>
          <div className="impressions-actions"><button type="button" disabled={pending || unknownResult} onClick={() => selectRecords(records)}>保存済みをすべて選ぶ</button>
            <button type="button" disabled={pending || unknownResult} onClick={() => selectRecords(records.filter((record) => record.rating === "liked"))}>「好き」の作品を選ぶ</button></div>
          <div className="impressions-share-options">{sortImpressionRecords(records).map((record) => {
            const selection = selections[record.anime.id];
            const canPublishNote = record.spoiler === "no_spoiler" && !!record.note;
            return <fieldset key={record.anime.id} disabled={pending || unknownResult}>
              <legend>{record.anime.title}</legend>
              <label className="impressions-select-row"><input type="checkbox" checked={!!selection} onChange={(event) => change(record, "selected", event.target.checked)} />この作品を公開<span>{record.anime.title}</span></label>
              <label><input type="checkbox" disabled={!selection || !canPublishNote} checked={canPublishNote && (selection?.includeNote ?? false)} onChange={(event) => change(record, "includeNote", event.target.checked)} />一言も公開</label>
              <label><input type="checkbox" disabled={!selection || !record.rating} checked={selection?.includeRating ?? false} onChange={(event) => change(record, "includeRating", event.target.checked)} />評価も公開</label>
              {!canPublishNote && <p>一言は公開できません（未入力・未指定・ネタバレあり）</p>}
            </fieldset>;
          })}</div>
          <section className="impressions-preview" aria-label="実際に公開される内容">
            <h3>実際に公開される内容</h3>
            {projection ? <ImpressionSnapshotView snapshot={projection.snapshot} /> : <p>公開する作品を選んでください。</p>}
          </section>
          <details className="impressions-share-details"><summary>公開について詳しく</summary><p>URLを知っている人が見られます。記録を編集しても公開内容は自動更新されません。公開はあとから停止できます。</p></details>
          {error && <div role="alert"><p>{error}</p>{conflict && <button type="button" disabled={pending} onClick={() => void refreshSelection()}>最新の記録を確認して選択を見直す</button>}</div>}
          {unknownResult && <button type="button" onClick={() => navigate("manage")}>共有の管理・履歴で確認</button>}
          <div className="impressions-share-cta"><button className="impressions-primary" type="button" disabled={pending || conflict || unknownResult || !projection || offline} onClick={() => void publish()}>{pending ? "公開しています…" : canonicalTarget ? `選んだ${projection?.input.selections.length ?? 0}作品で共有を更新` : `選んだ${projection?.input.selections.length ?? 0}作品を公開`}</button></div>
        </div>}
        {validStep === "result" && createdId && <div className="impressions-receipt" aria-live="polite">
          <p>{lastOperation === "created" ? "共有URLを作成しました。" : lastOperation === "updated" ? "同じ共有URLを更新しました。" : "同じ共有URLがすでに公開されています。"}</p>
          <button ref={receipt} className="impressions-primary" type="button" onClick={() => void copy(createdId)}>URLをコピー</button>
          <Link className="impressions-link" href={`/share/impressions/${createdId}`} prefetch={false}>公開中の共有を開く</Link>
          <button type="button" onClick={() => void shareNative(createdId)}>OSの共有を使う</button>
          <button type="button" onClick={() => navigate("manage")}>共有の管理・履歴</button>
        </div>}
      </BottomSheet>
      {validStep === "manage" && <button type="button" disabled={pending} onClick={() => { onReturn(); navigate(null); }}>自分の今期カードに戻る</button>}
      {validStep === "manage" && <>
        <p>公開内容は明示的に更新するまで固定されています。同じ期は同じURLを更新します。</p>
        {(historyState === "idle" || historyState === "loading") && <p role="status">公開履歴を読み込んでいます…</p>}
        {historyError && <div role="alert"><p>{historyError}</p><button type="button" onClick={() => void loadHistory()} disabled={pending || historyState === "loading"}>公開履歴を再読み込み</button></div>}
        {historyState === "ready" && <>
          {!shares.length && <p>公開中の共有はありません。</p>}
          <ul className="impressions-history">{shares.map((share) => <li key={share.shareId}>
            <Link className="impressions-link" href={`/share/impressions/${share.shareId}`} prefetch={false}>{seasonHeadingJa(share)}・{new Date(share.updatedAt).toLocaleString("ja-JP")}更新</Link>
            <div className="impressions-actions"><button type="button" onClick={() => void copy(share.shareId)}>URLをコピー</button>
              {share.canonical && share.year === seasonKey.year && share.season === seasonKey.season && <button type="button" disabled={pending || !recordsReady} onClick={() => startUpdate(share)}>この共有を更新</button>}
              <button type="button" disabled={pending} onClick={() => setConfirmStop(share.shareId)}>公開を停止</button></div>
            {confirmStop === share.shareId && <div role="group" aria-label="公開停止の確認"><p>この共有の公開を停止しますか？URLから見られなくなります。</p>
              <button type="button" disabled={pending || offline} onClick={() => void stop(share.shareId)}>公開停止を確定する</button><button type="button" disabled={pending} onClick={() => setConfirmStop(null)}>キャンセル</button></div>}
          </li>)}</ul>
          {unknownResult && <button type="button" disabled={pending || !recordsReady} onClick={() => { setUnknownResult(false); setError(""); selectRecords(sortImpressionRecords(records).slice(0, IMPRESSION_SHARE_INITIAL_LIMIT)); navigate("select"); }}>履歴を確認して選び直す</button>}
        </>}
      </>}
      <p role="status">{message}</p>
    </>}
  </section>;
}
