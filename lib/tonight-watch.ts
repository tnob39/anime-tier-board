import type { AnimeStatusRecord } from "@/lib/statuses";

const MAX_CANDIDATES = 3;

export type TonightMode = "continue" | "finish";

export type TonightCandidate = {
  record: AnimeStatusRecord;
  tags: string[];
  reason: string;
};

// Broadcast day string → JS weekday number (Sun=0 … Sat=6)
const WEEKDAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0, sundays: 0, 日: 0,
  mon: 1, monday: 1, mondays: 1, 月: 1,
  tue: 2, tuesday: 2, tuesdays: 2, 火: 2,
  wed: 3, wednesday: 3, wednesdays: 3, 水: 3,
  thu: 4, thursday: 4, thursdays: 4, 木: 4,
  fri: 5, friday: 5, fridays: 5, 金: 5,
  sat: 6, saturday: 6, saturdays: 6, 土: 6,
};

function broadcastWeekday(record: AnimeStatusRecord): number | null {
  const raw = record.anime?.airing?.broadcastDay?.toLowerCase().trim();
  if (!raw) return null;
  const num = WEEKDAY_MAP[raw];
  return num !== undefined ? num : null;
}

// 0 = today, 1 = yesterday, 2 = 2 days ago, …, 6 = one week ago
function daysSinceLastBroadcast(record: AnimeStatusRecord): number | null {
  const wd = broadcastWeekday(record);
  if (wd === null) return null;
  return ((new Date().getDay() - wd) + 7) % 7;
}

function daysSinceUpdated(record: AnimeStatusRecord): number {
  return (Date.now() - new Date(record.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
}

export function selectTonightCandidates(
  records: AnimeStatusRecord[],
  mode: TonightMode
): TonightCandidate[] {
  if (mode === "finish") return selectFinishCandidates(records);
  return selectContinueCandidates(records);
}

// ─── continue mode ───────────────────────────────────────────────────────────
// Targets "watching" and "paused" items.
// Weekly viewers: prioritised when an episode aired this week.
// Batch / slow viewers: prioritised when a show has been sitting untouched.

function selectContinueCandidates(records: AnimeStatusRecord[]): TonightCandidate[] {
  const scored: Array<{ candidate: TonightCandidate; score: number }> = [];

  for (const record of records) {
    if (!record.anime) continue;
    if (record.status !== "watching" && record.status !== "paused") continue;

    const tags: string[] = [];
    let reason = "";
    let score = 0;

    const sinceBroadcast = daysSinceLastBroadcast(record);
    const sinceUpdated = daysSinceUpdated(record);
    const fav = record.favoriteLevel ?? 0;

    // ── Broadcast recency ──
    if (sinceBroadcast !== null) {
      if (sinceBroadcast === 0) {
        score += 12;
        tags.push("今日放送");
        reason = "今日が放送日です";
      } else if (sinceBroadcast === 1) {
        score += 10;
        tags.push("昨日放送");
        reason = "昨日放送がありました";
      } else if (sinceBroadcast <= 3) {
        score += 7;
        tags.push("今週放送済み");
        reason = `${sinceBroadcast}日前に放送がありました`;
      } else if (sinceBroadcast <= 6) {
        score += 4;
        tags.push("今週放送済み");
        reason = "今週放送済みの作品です";
      }
    }

    // ── Accumulation (haven't touched it in a while) ──
    if (sinceUpdated >= 14) {
      const bonus = Math.min(sinceUpdated - 14, 14);
      score += 3 + bonus;
      tags.push("積みアニメ");
      if (!reason) reason = "しばらく更新がない作品です";
    } else if (sinceUpdated >= 7) {
      score += 2;
      tags.push("溜まってるかも");
      if (!reason) reason = `${Math.round(sinceUpdated)}日間更新なし`;
    }

    // ── Paused bonus ──
    if (record.status === "paused") {
      score += 8;
      tags.push("一時停止中");
      if (!reason) reason = "一時停止中の作品を再開しましょう";
    }

    // ── Favourite level ──
    score += fav * 1.5;
    if (fav >= 4 && !tags.includes("お気に入り")) {
      tags.push("お気に入り");
      if (!reason) reason = "お気に入り度が高い作品です";
    }

    if (score > 0) {
      if (!reason) reason = "視聴中の作品です";
      scored.push({ candidate: { record, tags, reason }, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_CANDIDATES).map((s) => s.candidate);
}

// ─── finish mode ──────────────────────────────────────────────────────────────
// Targets short shows (≤ 3 remaining episodes while watching) and movies.

function selectFinishCandidates(records: AnimeStatusRecord[]): TonightCandidate[] {
  const candidates: Array<{ candidate: TonightCandidate; priority: number }> = [];

  for (const record of records) {
    if (!record.anime) continue;

    const { anime } = record;
    const totalEps = anime.episodes ?? null;
    const tags: string[] = [];
    let reason = "";
    let priority = 0;

    if (record.status === "watching") {
      if (anime.format === "MOVIE") {
        priority = 200;
        tags.push("映画");
        reason = "映画なので今夜完走できます";
      } else if (totalEps !== null && totalEps <= 3) {
        priority = 180 - totalEps;
        tags.push(`全${totalEps}話`);
        reason = `全${totalEps}話なので今夜完走できます`;
      } else if (totalEps !== null && totalEps <= 6) {
        priority = 140 - totalEps;
        tags.push(`全${totalEps}話`);
        reason = "短めの作品です";
      }
    }

    if (record.status === "planned") {
      if (anime.format === "MOVIE") {
        priority = 190;
        tags.push("映画", "見たい");
        reason = "映画なので今夜観られます";
      } else if (totalEps !== null && totalEps <= 3) {
        priority = 170 - totalEps;
        tags.push(`全${totalEps}話`, "見たい");
        reason = `全${totalEps}話、今夜完走できます`;
      }
    }

    if (priority > 0) {
      candidates.push({ candidate: { record, tags, reason }, priority });
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.slice(0, MAX_CANDIDATES).map((c) => c.candidate);
}
