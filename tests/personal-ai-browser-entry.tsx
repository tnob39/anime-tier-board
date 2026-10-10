import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PersonalAiHandoff } from "../components/PersonalAiHandoff";
import { PERSONAL_AI_PURPOSES, type PersonalAiPurpose } from "../lib/personal-ai-context";
const works = [{ id: "anilist-1", title: "日本語作品😀" + "長い作品名".repeat(20), imageUrl: "https://sentinel.test/private-cover.jpg", userId: "PRIVATE_OWNER", saved: {
  year: 2026, season: "FALL" as const, revision: 2, note: "保存済みの好きな会話", rating: "liked" as const, spoiler: "no_spoiler" as const
} }, { id: "anilist-2", title: "二つめの作品" }];
function Harness() {
  const [purpose, setPurpose] = useState<PersonalAiPurpose | null>(null);
  const [context, setContext] = useState("owner-a");
  (window as unknown as { changeOwner: () => void }).changeOwner = () => setContext("owner-b");
  return <main><h1>実コンポーネントの検証</h1>{Object.entries(PERSONAL_AI_PURPOSES).map(([key, label]) => <button key={key} onClick={() => setPurpose(key as PersonalAiPurpose)}>{label}</button>)}
    {purpose && <PersonalAiHandoff purpose={purpose} works={(window.location.hash === "#long" ? Array.from({ length: 6 }, (_, i) => ({ ...works[0], id: `anilist-${i + 1}`, title: "日本語作品".repeat(60), saved: { ...works[0].saved!, note: "長いメモ".repeat(35) } })) : works)} seasonKey={{ year: 2026, season: "FALL" }} contextKey={context} onClose={() => setPurpose(null)} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
