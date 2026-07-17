"use client";

const PALETTE = [
  ["#6366f1", "#8b5cf6"],
  ["#ec4899", "#f43f5e"],
  ["#0ea5e9", "#06b6d4"],
  ["#10b981", "#14b8a6"],
  ["#f59e0b", "#ef4444"],
  ["#8b5cf6", "#ec4899"],
  ["#06b6d4", "#0ea5e9"],
  ["#14b8a6", "#10b981"],
];

function titleToColors(title: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xffffff;
  }
  const pair = PALETTE[hash % PALETTE.length];
  return [pair[0], pair[1]];
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
  const [from, to] = titleToColors(title);
  return (
    <div
      className={["anime-card-placeholder", className].filter(Boolean).join(" ")}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      role="img"
      aria-label={title}
      draggable={draggable}
    >
      <span>{initials(title)}</span>
    </div>
  );
}
