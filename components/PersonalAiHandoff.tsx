"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { buildPersonalAiPrompt, PERSONAL_AI_PLATFORMS, PERSONAL_AI_PURPOSES,
  type PersonalAiPurpose, type PersonalAiSeason, type PersonalAiSelection, type PersonalAiWork } from "@/lib/personal-ai-context";
import { buildChatGptLink, CHATGPT_HOME, openPersonalAiWindow } from "@/lib/personal-ai-link";
import "./personal-ai-handoff.css";

export type PersonalAiHandoffProps = {
  purpose: PersonalAiPurpose; works: readonly PersonalAiWork[]; seasonKey?: PersonalAiSeason;
  /** Local identity/context boundary, never serialized. Change it when owner or source changes. */
  contextKey: string; onClose: () => void; onChangePurpose?: () => void;
};
/** Mount only while open. The keyed session also discards consent on owner/context/source changes. */
export function PersonalAiHandoff(props: PersonalAiHandoffProps) {
  const source = JSON.stringify(props.works);
  return <Session key={`${props.contextKey}:${props.purpose}:${props.seasonKey?.year}:${props.seasonKey?.season}:${source}`} {...props} />;
}
function Session({ purpose, works, seasonKey, onClose, onChangePurpose }: PersonalAiHandoffProps) {
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
  function change(update: () => void) { epoch.current++; setStatus(""); setOpenUnconfirmed(false); update(); }
  function close() { active.current = false; epoch.current++; onClose(); }
  function opt(id: string, field: "includeNote" | "includeRating", checked: boolean) {
    change(() => setSelections((current) => current.map((s) => s.id === id
      ? { ...s, [field]: checked, revision: works.find((w) => w.id === id)?.saved?.revision } : s)));
  }
  const chatGptLink = buildChatGptLink(prompt);
  const [destination, setDestination] = useState("chatgpt");
  const provider = destination === "claude" ? "Claude" : destination === "gemini" ? "Gemini" : "ChatGPT";
  const home = destination === "claude" ? "https://claude.ai/" : destination === "gemini" ? "https://gemini.google.com/" : CHATGPT_HOME;
  const prefill = destination === "chatgpt" ? chatGptLink : null;
  const [openUnconfirmed, setOpenUnconfirmed] = useState(false);
  async function handoff() {
    if (!prompt) return;
    const token = ++epoch.current;
    const outcome = openPersonalAiWindow(prefill ?? home);
    setOpenUnconfirmed(true);
    const recovery = outcome === "exception"
      ? " 新しいタブを開く操作でエラーが発生しました。下のリンクから開き、全文を貼り付けてください。"
      : " 新しいタブが開いたかは確認できません。開いていなければ下のリンクから開き、全文を貼り付けてください。";
    if (prefill) {
      setStatus("全文を含むURLでChatGPTを開く操作を試みました。送信・入力・処理開始は確認できません。反映されなければ全文をコピーして貼り付けてください。" + recovery);
      return;
    }
    setStatus("コピー中…");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(prompt);
      if (active.current && epoch.current === token) setStatus(`全文をコピーしました。プロンプトはURLで送信していません。${provider}に貼り付けてください。` + recovery);
    } catch {
      if (!active.current || epoch.current !== token) return;
      preview.current?.focus(); preview.current?.select();
      setStatus(`コピーできませんでした。全文を選択しました。Ctrl+C / ⌘C、または長押しで手動コピーし、${provider}に貼り付けてください。プロンプトはURLで送信していません。` + recovery);
    }
  }
  async function copy() {
    if (!prompt) return;
    const token = ++epoch.current;
    setStatus("コピー中…");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(prompt);
      if (active.current && epoch.current === token) setStatus("全文をコピーしました。このコピー操作ではAIに送信しません。");
    } catch {
      if (!active.current || epoch.current !== token) return;
      preview.current?.focus(); preview.current?.select();
      setStatus("コピーできませんでした。全文を選択しました。Ctrl+C / ⌘C、または長押しで手動コピーしてください。");
    }
  }
  return <BottomSheet open onOpenChange={(open) => { if (!open) close(); }} title={PERSONAL_AI_PURPOSES[purpose]} className="personal-ai-sheet">
    <div className="personal-ai-content">
      <p>用途：{PERSONAL_AI_PURPOSES[purpose]}</p>
      {onChangePurpose && <button type="button" onClick={onChangePurpose}>用途を選び直す</button>}
      <p>Claude / Geminiは全文をコピーして通常のページを開きます。貼り付けが必要です。事前入力や送信はしません。</p>
      <p>未保存の入力は含みません。「ChatGPTで開く」を押すと、下の全文をURLでChatGPTに送信し、処理が始まる可能性があります。URLはブラウザ履歴やサービスのログ等に残る可能性があります。アプリの方針上限はエンコード後のURL全体で12000文字です。サービスやブラウザの対応を保証する上限ではなく、送信・入力の反映・処理開始は確認できません。渡した情報にはAI事業者の保存・利用規約が適用されます。「全文をコピーしてChatGPTを開く」は通常のページを開くだけで、プロンプトをURLでは送りません。コピーだけではAIに送信しません。</p>
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
      {destination === "chatgpt" && prompt && !chatGptLink && <p>全文を含むURLがアプリの方針上限（エンコード後12000文字・サービス側の対応保証ではありません）を超えるため、短縮せず全文をコピーして通常のChatGPTを開きます。URLではプロンプトを送りません。コピーに失敗した場合は手動コピーしてください。</p>}
      <label>渡し先<select value={destination} onChange={(e) => change(() => setDestination(e.target.value))}>
        <option value="chatgpt">ChatGPT（全文URL・上限超過時はコピー）</option>
        <option value="copy">全文をコピー（自分で渡す）</option>
        <option value="claude">Claude（コピーして開く・貼り付けが必要）</option>
        <option value="gemini">Gemini（コピーして開く・貼り付けが必要）</option>
      </select></label>
      {destination !== "copy" && <button type="button" disabled={!prompt} onClick={() => void handoff()}>{destination === "chatgpt" ? (chatGptLink || !prompt ? "ChatGPTで開く" : "全文をコピーしてChatGPTを開く") : `${provider}にコピーして開く・貼り付けが必要`}</button>}
      <button type="button" disabled={!prompt} onClick={() => void copy()}>プロンプトをコピー</button>
      {openUnconfirmed && <a href={home} target="_blank" rel="noopener noreferrer">通常の{provider}を開く（全文は手動で貼り付け）</a>}
      <p role="status" aria-live="polite">{status}</p>
    </div>
  </BottomSheet>;
}
