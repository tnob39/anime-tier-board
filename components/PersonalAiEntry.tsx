"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PersonalAiHandoff, type PersonalAiHandoffProps } from "./PersonalAiHandoff";
import { buildPersonalAiPrompt, PERSONAL_AI_PURPOSES, type PersonalAiPurpose, type PersonalAiWork } from "@/lib/personal-ai-context";

type Props = Omit<PersonalAiHandoffProps, "onClose" | "purpose"> & {
  purposes: readonly PersonalAiPurpose[]; disabled?: boolean; selectedWork?: PersonalAiWork;
};
export function PersonalAiPurposeChooser({ purposes, works, selectedWork, onChoose, onClose }: {
  purposes: readonly PersonalAiPurpose[]; works: readonly PersonalAiWork[]; selectedWork?: PersonalAiWork;
  onChoose: (purpose: PersonalAiPurpose, work?: PersonalAiWork) => void; onClose: () => void;
}) {
  const [workId, setWorkId] = useState(selectedWork?.id ?? "");
  const eligibleWorks = works.filter((item) => {
    try { buildPersonalAiPrompt({ purpose: "know", works, selections: [{ id: item.id, includeNote: false, includeRating: false }] }); return true; }
    catch { return false; }
  });
  const work = eligibleWorks.find((item) => item.id === workId);
  return <BottomSheet open onOpenChange={(open) => { if (!open) onClose(); }} title="AIに相談" className="personal-ai-sheet">
    <div className="personal-ai-content">
      <p>用途を選び、渡す内容を確認します。ここではAIに送信しません。</p>
      {!selectedWork && purposes.some((p) => p === "know" || p === "similar") && <label>相談する作品（明示選択）
        <select value={workId} onChange={(e) => setWorkId(e.target.value)}><option value="">作品を選んでください</option>{eligibleWorks.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}</select>
      </label>}
      {selectedWork && <p>対象：{selectedWork.title}</p>}
      <fieldset><legend>用途</legend><div className="personal-ai-purpose-list">
        {purposes.map((purpose) => <button key={purpose} type="button" disabled={(purpose === "know" || purpose === "similar") && !work} onClick={() => onChoose(purpose, work)}>{PERSONAL_AI_PURPOSES[purpose]}</button>)}
      </div></fieldset>
    </div>
  </BottomSheet>;
}
/** The local boundary never becomes part of the exported prompt. */
export function PersonalAiEntry(props: Props) {
  return <EntrySession key={`${props.contextKey}:${JSON.stringify(props.works)}:${props.seasonKey?.year}:${props.seasonKey?.season}`} {...props} />;
}
function EntrySession({ disabled = false, purposes, selectedWork, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<{ purpose: PersonalAiPurpose; work?: PersonalAiWork } | null>(null);
  useEffect(() => { if (disabled) { setOpen(false); setChoice(null); } }, [disabled]);
  function close() { setOpen(false); setChoice(null); }
  return <>
    <button className="personal-ai-entry" type="button" disabled={disabled} onClick={() => { setChoice(null); setOpen(true); }}>AIに相談</button>
    {open && !disabled && (choice ? <PersonalAiHandoff {...props} purpose={choice.purpose} works={choice.purpose === "know" || choice.purpose === "similar" ? (choice.work ? [choice.work] : []) : props.works} onClose={close} onChangePurpose={() => setChoice(null)} />
      : <PersonalAiPurposeChooser purposes={purposes} works={props.works} selectedWork={selectedWork} onClose={close} onChoose={(purpose, work) => setChoice({ purpose, work })} />)}
  </>;
}
