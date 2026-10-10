"use client";

import { useEffect, useState } from "react";
import { PersonalAiHandoff, type PersonalAiHandoffProps } from "./PersonalAiHandoff";
import { PERSONAL_AI_PURPOSES } from "@/lib/personal-ai-context";

type Props = Omit<PersonalAiHandoffProps, "onClose"> & { disabled?: boolean };

/** The local boundary never becomes part of the exported prompt. */
export function PersonalAiEntry(props: Props) {
  return <EntrySession key={`${props.contextKey}:${props.purpose}`} {...props} />;
}
function EntrySession({ disabled = false, ...props }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <>
    <button className="personal-ai-entry" type="button" disabled={disabled} onClick={() => setOpen(true)}>{PERSONAL_AI_PURPOSES[props.purpose]}</button>
    {open && !disabled && <PersonalAiHandoff {...props} onClose={() => setOpen(false)} />}
  </>;
}
