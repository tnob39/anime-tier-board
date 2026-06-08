import type { AnimeStatusRecord } from "@/lib/statuses";

const MAX_CANDIDATES = 3;
const BATCH_STALE_DAYS = 7;
const SLOW_STALE_DAYS = 14;

export type TonightMode = "continue" | "finish";

function daysSince(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

export function selectTonightCandidates(
  records: AnimeStatusRecord[],
  mode: TonightMode
): AnimeStatusRecord[] {
  if (mode === "continue") {
    return selectContinueCandidates(records);
  }
  return selectFinishCandidates(records);
}

function selectContinueCandidates(records: AnimeStatusRecord[]): AnimeStatusRecord[] {
  const scored: Array<{ record: AnimeStatusRecord; score: number }> = [];

  for (const record of records) {
    if (!record.anime) continue;
    if (record.status !== "watching" && record.status !== "paused") continue;
    if (record.watchRhythm === "weekly") continue;

    const days = daysSince(record.updatedAt);
    let score = 0;

    if (record.status === "paused") {
      score = 100;
    } else if (record.watchRhythm === "batch" && days >= BATCH_STALE_DAYS) {
      score = 80 + Math.min(days, 30);
    } else if (record.watchRhythm === "slow" && days >= SLOW_STALE_DAYS) {
      score = 60 + Math.min(days, 30);
    } else if (record.watchRhythm === null && days >= SLOW_STALE_DAYS) {
      score = 40 + Math.min(days, 30);
    }

    if (score > 0) {
      scored.push({ record, score });
    }
  }

  scored.sort((a, b) => b.score - a.score + (Math.random() - 0.5) * 10);
  return scored.slice(0, MAX_CANDIDATES).map((s) => s.record);
}

function selectFinishCandidates(records: AnimeStatusRecord[]): AnimeStatusRecord[] {
  const candidates: Array<{ record: AnimeStatusRecord; priority: number }> = [];

  for (const record of records) {
    if (!record.anime) continue;

    const episodes = record.anime.episodes ?? null;

    if (record.status === "watching" && episodes !== null) {
      if (episodes <= 3) {
        candidates.push({ record, priority: 200 - episodes });
      }
    }

    if (record.status === "planned") {
      if (episodes !== null && episodes <= 12) {
        candidates.push({ record, priority: 100 - episodes });
      } else if (record.anime.format === "MOVIE") {
        candidates.push({ record, priority: 90 });
      } else if (episodes === 1) {
        candidates.push({ record, priority: 95 });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority + (Math.random() - 0.5) * 5);
  return candidates.slice(0, MAX_CANDIDATES).map((c) => c.record);
}
