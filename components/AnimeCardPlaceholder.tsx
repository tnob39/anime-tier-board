"use client";

/** Ordered tone pairs (length/order preserved from prior hex palette). */
const TONE_PAIRS = [
  ["indigo", "violet"],
  ["pink", "rose"],
  ["sky", "cyan"],
  ["emerald", "teal"],
  ["amber", "red"],
  ["violet", "pink"],
  ["cyan", "sky"],
  ["teal", "emerald"],
] as const;

function titleToPairClass(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xffffff;
  }
  const [from, to] = TONE_PAIRS[hash % TONE_PAIRS.length];
  return `anime-card-placeholder-pair-${from}-${to}`;
}

function initials(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  // 日本語は最初の2文字、英語は頭文字2文字
  const chars = [...trimmed];
  return chars.slice(0, 2).join("");
}

export default function AnimeCardPlaceholder({
  title,
  className,
  draggable,
}: {
  title: string;
  className?: string;
  draggable?: boolean;
}) {
  const pairClass = titleToPairClass(title);
  return (
    <div
      className={["anime-card-placeholder", pairClass, className].filter(Boolean).join(" ")}
      role="img"
      aria-label={title}
      draggable={draggable}
    >
      <span>{initials(title)}</span>
    </div>
  );
}
