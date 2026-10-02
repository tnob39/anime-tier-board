"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImpressionSnapshotView } from "@/components/ImpressionSnapshotView";
import { buildImpressionSnapshot, type ImpressionSeason, type SeasonImpression, type ImpressionSelection,
  type ImpressionShareHistory, type ImpressionShareInput, type ImpressionSnapshot } from "@/lib/season-impressions-model";
import { seasonHeadingJa } from "@/lib/season";
import { impressionError, impressionRequest } from "./impressions-request";

export function ImpressionSharing({ userId, seasonKey, records, reloadRecords }: {
  userId: string; seasonKey: ImpressionSeason; records: SeasonImpression[]; reloadRecords: () => Promise<SeasonImpression[]>;
}) {
  const [selections, setSelections] = useState<Record<string, ImpressionSelection>>({});
  const [preview, setPreview] = useState<{ input: ImpressionShareInput; snapshot: ImpressionSnapshot } | null>(null);
  const [shares, setShares] = useState<ImpressionShareHistory[]>([]);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [pending, setPending] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const busy = useRef(false);

  async function loadHistory() {
    try {
      const result = await impressionRequest<{ shares: ImpressionShareHistory[] }>("/api/shares?kind=season-impressions", { headers: { "X-Impression-Owner": encodeURIComponent(userId) } });
      if (mounted.current) { setShares(result.shares); setHistoryError(""); }
    } catch (failure) { if (mounted.current) setHistoryError(impressionError(failure)); }
  }
  useEffect(() => {
    mounted.current = true;
    void loadHistory();
    return () => { mounted.current = false; };
  }, []);

  function change(record: SeasonImpression, field: "selected" | "includeRating" | "includeNote", value: boolean) {
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
    const input: ImpressionShareInput = { kind: "season-impressions", ...seasonKey, selections: Object.values(selections) };
    if (!input.selections.length) { setError("公開する作品を選んでください。"); return; }
    const snapshot = buildImpressionSnapshot(input, records);
    if (!snapshot) { setError("記録が変更されています。最新の記録を読み直して、公開する項目を選択してください。"); return; }
    setPreview({ input, snapshot }); setError(""); setCreatedId(null);
  }
  async function publish() {
    if (!preview || busy.current || createdId) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await impressionRequest<{ shareId: string }>("/api/shares", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Impression-Owner": encodeURIComponent(userId) }, body: JSON.stringify(preview.input)
      });
      if (!mounted.current) return;
      setCreatedId(result.shareId);
      setShares((current) => [{ ...seasonKey, shareId: result.shareId, createdAt: new Date().toISOString() }, ...current]);
      setMessage("共有URLを作成しました。公開内容はこの時点で固定されています。");
    } catch (failure) { if (mounted.current) setError(impressionError(failure)); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  async function stop(shareId: string) {
    if (busy.current) return;
    busy.current = true; setPending(true); setHistoryError("");
    try {
      await impressionRequest(`/api/shares/${shareId}`, { method: "DELETE", headers: { "X-Impression-Owner": encodeURIComponent(userId) } });
      if (!mounted.current) return;
      setShares((current) => current.filter((share) => share.shareId !== shareId));
      if (createdId === shareId) { setCreatedId(null); setPreview(null); }
      setMessage("公開を停止しました。このURLからは取得できません。");
    } catch (failure) { if (mounted.current) setHistoryError(impressionError(failure)); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  async function copy(shareId: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/impressions/${shareId}`);
      setMessage("共有URLをコピーしました。");
    } catch { setMessage("コピーできませんでした。共有リンクを開いてURLをコピーしてください。"); }
  }

  return <section className="impressions-sharing" aria-labelledby="impressions-sharing-title">
    <h2 id="impressions-sharing-title">今の印象を共有</h2>
    <p>作品・評価・一言を選び、公開前に確認できます。一言は「ネタバレなし」で明示選択したものだけ公開します。</p>
    <p>公開済みURLの内容は、記録を編集・削除しても変わりません。</p>
    {!records.length && <p>作品を確認して保存すると、共有する項目を選べます。</p>}
    <div className="impressions-share-options">
      {records.map((record) => {
        const selection = selections[record.anime.id];
        const canPublishNote = record.spoiler === "no_spoiler" && !!record.note;
        return <fieldset key={record.anime.id} disabled={pending}>
          <legend>{record.anime.title}</legend>
          <label><input type="checkbox" checked={!!selection} onChange={(event) => change(record, "selected", event.target.checked)} />この作品を公開</label>
          <label><input type="checkbox" disabled={!selection} checked={selection?.includeRating ?? false} onChange={(event) => change(record, "includeRating", event.target.checked)} />評価も公開</label>
          <label><input type="checkbox" disabled={!selection || !canPublishNote} checked={canPublishNote && (selection?.includeNote ?? false)} onChange={(event) => change(record, "includeNote", event.target.checked)} />一言も公開</label>
          {!canPublishNote && <p>一言は非公開（未入力・未指定・ネタバレあり）</p>}
        </fieldset>;
      })}
    </div>
    {records.length > 0 && <button type="button" disabled={pending || !Object.keys(selections).length} onClick={makePreview}>公開内容をプレビュー</button>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={pending} onClick={async () => {
      setPending(true);
      try { await reloadRecords(); setSelections({}); setPreview(null); setError(""); }
      catch (failure) { setError(impressionError(failure)); }
      finally { setPending(false); }
    }}>最新の記録を読み直す</button></div>}
    {preview && <section className="impressions-preview" aria-label="公開内容のプレビュー">
      <h3>公開内容のプレビュー</h3>
      <p>{seasonHeadingJa(preview.snapshot)} 今期チェック</p>
      <ImpressionSnapshotView snapshot={preview.snapshot} />
      {!createdId && <button className="impressions-primary" type="button" disabled={pending} onClick={() => void publish()}>{pending ? "公開しています…" : "この内容で公開URLを作成"}</button>}
      {createdId && <div className="impressions-actions"><Link className="impressions-link" href={`/share/impressions/${createdId}`} prefetch={false}>作成した共有を開く</Link>
        <button type="button" onClick={() => void copy(createdId)}>URLをコピー</button></div>}
    </section>}
    <p role="status">{message}</p>
    <h2>公開履歴（公開中）</h2>
    {historyError && <div role="alert"><p>{historyError}</p><button type="button" onClick={() => void loadHistory()} disabled={pending}>公開履歴を再読み込み</button></div>}
    {!shares.length && !historyError && <p>公開中の共有はありません。</p>}
    <ul className="impressions-history">{shares.map((share) => <li key={share.shareId}>
      <Link className="impressions-link" href={`/share/impressions/${share.shareId}`} prefetch={false}>
        {seasonHeadingJa(share)}・{new Date(share.createdAt).toLocaleString("ja-JP")}の共有</Link>
      <div className="impressions-actions"><button type="button" onClick={() => void copy(share.shareId)}>URLをコピー</button>
        <button type="button" disabled={pending} onClick={() => void stop(share.shareId)}>公開を停止</button></div>
    </li>)}</ul>
  </section>;
}
