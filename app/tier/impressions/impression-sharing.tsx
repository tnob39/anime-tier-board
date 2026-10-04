"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type Step = "select" | "preview" | "result" | "manage";
const steps: Step[] = ["select", "preview", "result", "manage"];
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
  const validStep = step === "preview" && !preview ? "select" : step === "result" && !createdId ? "manage" : step;
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
  function start() {
    if (busy.current || !recordsReady || unknownResult) return;
    selectRecords(sortImpressionRecords(records).slice(0, IMPRESSION_SHARE_INITIAL_LIMIT)); navigate("select");
    track({ name: "impression_share", action: "select", count: Math.min(records.length, IMPRESSION_SHARE_INITIAL_LIMIT) });
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
  function makePreview() {
    if (!recordsReady) return;
    const input: ImpressionShareInput = { kind: "season-impressions", ...seasonKey, selections: Object.values(selections) };
    if (!input.selections.length) { setError("公開する作品を選んでください。"); return; }
    const snapshot = buildImpressionSnapshot(input, records);
    if (!snapshot) { setConflict(true); setError("記録が変更されています。最新の記録を確認してください。"); return; }
    setPreview({ input, snapshot }); setError(""); setCreatedId(null); navigate("preview");
    track({ name: "impression_share", action: "preview", count: input.selections.length });
  }
  async function refreshSelection() {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try {
      const latest = await reloadRecords();
      if (!mounted.current) return;
      setSelections((current) => Object.fromEntries(latest.flatMap((record) => {
        const selection = current[record.anime.id];
        return selection ? [[record.anime.id, { ...selection, revision: record.revision,
          includeNote: selection.revision === record.revision && selection.includeNote && record.spoiler === "no_spoiler" && !!record.note }]] : [];
      })));
      setPreview(null); setConflict(false); setError("");
      setMessage("最新の記録を読み込みました。削除された作品を外し、変更された作品の一言を非公開に戻しました。もう一度プレビューを確認してください。");
      navigate("select", true);
    } catch (failure) {
      if (mounted.current) { setError(impressionError(failure)); if (statusOf(failure) === 401) requireLogin(); }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  async function publish() {
    if (!preview || busy.current || createdId || unknownResult || conflict || authRequired || !recordsReady || offline) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await impressionRequest<{ shareId: string }>("/api/shares", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Impression-Owner": encodeURIComponent(userId) }, body: JSON.stringify(preview.input)
      });
      if (!mounted.current) return;
      if (typeof result.shareId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(result.shareId)) throw new Error("unknown result");
      setCreatedId(result.shareId); setMessage("共有URLを作成しました。公開内容はこの時点で固定されています。");
      navigate("result");
      track({ name: "impression_share", action: "published", count: preview.input.selections.length });
    } catch (failure) {
      if (!mounted.current) return;
      const status = statusOf(failure);
      if (status === 401) requireLogin();
      else if (status === 409) { setConflict(true); setError("記録が変更または削除されています。最新の記録を確認してから公開してください。"); }
      else if (status === 429) setError("共有の作成が混み合っています。しばらく待ってから、もう一度公開してください。");
      else if (status && status >= 400 && status < 500) setError(impressionError(failure));
      else { setUnknownResult(true); setError("公開結果を確認できませんでした。重複作成を避けるため、共有の管理・履歴で作成済みのURLを確認してください。"); }
      track({ name: "impression_share", action: status && status < 500 ? "rejected" : "unknown", count: preview.input.selections.length });
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
      {validStep && <button type="button" disabled={pending} onClick={() => { onReturn(); navigate(null); }}>自分の今期カードに戻る</button>}
      {validStep && validStep !== "manage" && <p className="impressions-steps" aria-label="共有の手順">
        <span aria-current={validStep === "select" ? "step" : undefined}>1 選択</span><span aria-current={validStep === "preview" ? "step" : undefined}>2 プレビュー</span><span aria-current={validStep === "result" ? "step" : undefined}>3 URL受領</span>
      </p>}
      {validStep === "select" && <>
        {!recordsReady ? <p>保存済みの記録を確認しています。</p> : <>
          <div className="impressions-actions"><button type="button" disabled={pending || unknownResult} onClick={() => selectRecords(records)}>保存済みをすべて選ぶ</button>
            <button type="button" disabled={pending || unknownResult} onClick={() => selectRecords(records.filter((record) => record.rating === "liked"))}>「好き」の作品を選ぶ</button></div>
          <p>最近記録した最大6作品を選んでいます。最初は作品情報のみ。一言・評価は作品ごとに追加できます。</p>
          <p>一言は非公開です。「ネタバレなし」の一言だけ、作品ごとに追加できます。</p>
          <div className="impressions-share-options">{sortImpressionRecords(records).map((record) => {
            const selection = selections[record.anime.id];
            const canPublishNote = record.spoiler === "no_spoiler" && !!record.note;
            return <fieldset key={record.anime.id} disabled={pending || unknownResult}>
              <legend>{record.anime.title}</legend>
              <label className="impressions-select-row"><input type="checkbox" checked={!!selection} onChange={(event) => change(record, "selected", event.target.checked)} />この作品を公開<span>{record.anime.title}</span></label>
              <label><input type="checkbox" disabled={!selection || !canPublishNote} checked={canPublishNote && (selection?.includeNote ?? false)} onChange={(event) => change(record, "includeNote", event.target.checked)} />一言も公開</label>
              <label><input type="checkbox" disabled={!selection || !record.rating} checked={selection?.includeRating ?? false} onChange={(event) => change(record, "includeRating", event.target.checked)} />評価も公開</label>
              {!canPublishNote && <p>一言は非公開（未入力・未指定・ネタバレあり）</p>}
            </fieldset>;
          })}</div>
          {!records.length && <p>まず1作品を保存してください。</p>}
          <button className="impressions-primary" type="button" disabled={pending || conflict || unknownResult || !Object.keys(selections).length} onClick={makePreview}>公開内容をプレビュー</button>
        </>}
      </>}
      {validStep === "preview" && preview && <section className="impressions-preview" aria-label="公開内容のプレビュー">
        <h3>公開内容のプレビュー</h3>
        <ImpressionSnapshotView snapshot={preview.snapshot} />
        <p>URLを知っている人が見られます。</p>
        <p>公開後に記録を編集・削除しても、この共有の内容は変わりません。</p>
        <p>公開はあとから停止できます。コメント・リアクションはありません。</p>
        <div className="impressions-actions"><button type="button" disabled={pending} onClick={() => navigate("select")}>選択に戻る</button>
          {createdId ? <button type="button" onClick={() => navigate("result")}>作成済みのURLを確認</button> : <button className="impressions-primary" type="button" disabled={pending || conflict || unknownResult || !recordsReady || offline} onClick={() => void publish()}>{pending ? "公開しています…" : "この内容で公開URLを作成"}</button>}</div>
      </section>}
      {validStep === "result" && createdId && <div className="impressions-receipt">
        <p>共有URLを作成しました。</p>
        <button ref={receipt} className="impressions-primary" type="button" onClick={() => void copy(createdId)}>URLをコピー</button>
        <label>共有URL<input readOnly value={typeof window === "undefined" ? "" : `${window.location.origin}/share/impressions/${createdId}`} onFocus={(event) => event.target.select()} /></label>
        <Link className="impressions-link" href={`/share/impressions/${createdId}`} prefetch={false}>作成した共有を開く</Link>
        <button type="button" onClick={() => navigate("manage")}>共有の管理・履歴</button>
      </div>}
      {error && <div role="alert"><p>{error}</p>
        {conflict && <button type="button" disabled={pending} onClick={() => void refreshSelection()}>最新の記録を確認して選択を見直す</button>}
      </div>}
      {unknownResult && validStep !== "manage" && <button type="button" onClick={() => navigate("manage")}>共有の管理・履歴で確認</button>}
      {validStep === "manage" && <>
        <p>公開内容は作成時点で固定されています。</p>
        {(historyState === "idle" || historyState === "loading") && <p role="status">公開履歴を読み込んでいます…</p>}
        {historyError && <div role="alert"><p>{historyError}</p><button type="button" onClick={() => void loadHistory()} disabled={pending || historyState === "loading"}>公開履歴を再読み込み</button></div>}
        {historyState === "ready" && <>
          {!shares.length && <p>公開中の共有はありません。</p>}
          <ul className="impressions-history">{shares.map((share) => <li key={share.shareId}>
            <Link className="impressions-link" href={`/share/impressions/${share.shareId}`} prefetch={false}>{seasonHeadingJa(share)}・{new Date(share.createdAt).toLocaleString("ja-JP")}の共有</Link>
            <div className="impressions-actions"><button type="button" onClick={() => void copy(share.shareId)}>URLをコピー</button>
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
