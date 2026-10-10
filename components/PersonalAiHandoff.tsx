"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { buildPersonalAiPrompt, PERSONAL_AI_PLATFORMS, PERSONAL_AI_PURPOSES,
  type PersonalAiPurpose, type PersonalAiSeason, type PersonalAiSelection, type PersonalAiWork } from "@/lib/personal-ai-context";
import "./personal-ai-handoff.css";

export type PersonalAiHandoffProps = {
  purpose: PersonalAiPurpose; works: readonly PersonalAiWork[]; seasonKey?: PersonalAiSeason;
  /** Local identity/context boundary, never serialized. Change it when owner or source changes. */
  contextKey: string; onClose: () => void;
};
/** Mount only while open. The keyed session also discards consent on owner/context/source changes. */
export function PersonalAiHandoff(props: PersonalAiHandoffProps) {
  const source = JSON.stringify(props.works);
  return <Session key={`${props.contextKey}:${props.purpose}:${props.seasonKey?.year}:${props.seasonKey?.season}:${source}`} {...props} />;
}
function Session({ purpose, works, seasonKey, onClose }: PersonalAiHandoffProps) {
  const id = useId();
  const [selections, setSelections] = useState<PersonalAiSelection[]>(() => purpose === "know" || purpose === "similar"
    ? works.slice(0, 1).map((w) => ({ id: w.id, includeNote: false, includeRating: false })) : []);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const preview = useRef<HTMLTextAreaElement>(null);
  const epoch = useRef(0);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; epoch.current++; }; }, []);
  let prompt = "", error = "";
  try { prompt = buildPersonalAiPrompt({ purpose, works, selections, seasonKey, reaction: { from, to, platform } }); }
  catch (failure) { error = failure instanceof Error ? failure.message : "渡す内容を確認してください。"; }
  function change(update: () => void) { epoch.current++; setStatus(""); update(); }
  function close() { active.current = false; epoch.current++; onClose(); }
  function opt(id: string, field: "includeNote" | "includeRating", checked: boolean) {
    change(() => setSelections((current) => current.map((s) => s.id === id
      ? { ...s, [field]: checked, revision: works.find((w) => w.id === id)?.saved?.revision } : s)));
  }
  async function copy() {
    if (!prompt) return;
    const token = ++epoch.current;
    setStatus("コピー中…");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(prompt);
      if (active.current && epoch.current === token) setStatus("コピーしました。まだAIには送信していません。");
    } catch {
      if (!active.current || epoch.current !== token) return;
      preview.current?.focus(); preview.current?.select();
      setStatus("コピーできませんでした。全文を選択しました。Ctrl+C / ⌘C、または長押しで手動コピーしてください。");
    }
  }
  return <BottomSheet open onOpenChange={(open) => { if (!open) close(); }} title={PERSONAL_AI_PURPOSES[purpose]} className="personal-ai-sheet">
    <div className="personal-ai-content">
      <p>この画面からAIへの送信や公開はしません。コピー後、貼り付け先のAIサービスに情報が渡り、その事業者の保存・利用規約が適用されます。未保存の入力は含みません。</p>
      {seasonKey && <p>対象：{seasonKey.year}年{({ WINTER: "冬", SPRING: "春", SUMMER: "夏", FALL: "秋" } as const)[seasonKey.season]}</p>}
      {purpose === "reaction" ? <fieldset><legend>調べる範囲（すべて必須）</legend>
        <label>開始日（JST）<input type="date" value={from} onChange={(e) => change(() => setFrom(e.target.value))} /></label>
        <label>終了日（JST）<input type="date" value={to} onChange={(e) => change(() => setTo(e.target.value))} /></label>
        <label>プラットフォーム<select value={platform} onChange={(e) => change(() => setPlatform(e.target.value))}><option value="">選んでください</option>{PERSONAL_AI_PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></label>
        <p>公開反応には取得範囲・媒体の偏りがあります。世論や代表的な人気投票ではありません。実測結果はありません。</p>
      </fieldset> : <fieldset><legend>{purpose === "taste" ? "好みの根拠（最大6作品・未選択から開始）" : "含める情報"}</legend>
        {(purpose === "taste" ? works : works.slice(0, 1)).map((work) => {
          const selection = selections.find((s) => s.id === work.id);
          return <div key={work.id} className="personal-ai-work">
            {purpose === "taste" ? <label><input type="checkbox" checked={!!selection} disabled={!selection && selections.length >= 6} onChange={(e) => change(() => setSelections((current) => e.target.checked
              ? [...current, { id: work.id, includeNote: false, includeRating: false }] : current.filter((s) => s.id !== work.id)))} />{work.title}を根拠にする</label> : <strong>{work.title}</strong>}
            {work.saved?.rating && <label><input type="checkbox" disabled={!selection} checked={selection?.includeRating ?? false} onChange={(e) => opt(work.id, "includeRating", e.target.checked)} />保存済み評価を含める</label>}
            {work.saved?.spoiler === "no_spoiler" && work.saved.note && <label><input type="checkbox" disabled={!selection} checked={selection?.includeNote ?? false} onChange={(e) => opt(work.id, "includeNote", e.target.checked)} />保存済みネタバレなしメモを含める</label>}
          </div>;
        })}
        {!works.length && <p>根拠にできる作品がありません。</p>}
      </fieldset>}
      <p role="status">{error}</p>
      <label htmlFor={`${id}-prompt`}>プロンプト全文（この文字列をコピー）</label>
      <textarea id={`${id}-prompt`} ref={preview} readOnly spellCheck={false} value={prompt} rows={14} />
      <button type="button" disabled={!prompt} onClick={() => void copy()}>プロンプトをコピー</button>
      <p role="status" aria-live="polite">{status}</p>
    </div>
  </BottomSheet>;
}
