import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso";
import {
  getAllNativePushTokens,
  removeNativePushToken,
  sendExpoPushNotifications
} from "@/lib/native-push";
import { getAllSubscriptions, removeSubscription, sendPushNotification } from "@/lib/push";
import type { AnimeItem } from "@/lib/types";

// 日本語曜日 → Date.getDay() のインデックスに対応
const JP_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function getTodayJP(nowJST: Date): string {
  return JP_WEEKDAYS[nowJST.getDay()];
}

function toJST(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

type StatusRow = {
  userId: string;
  animeJson: string;
  status: string;
};

async function getTodayWatchingByUser(): Promise<Map<string, AnimeItem[]>> {
  const nowJST = toJST(new Date());
  const todayJP = getTodayJP(nowJST);

  const result = await getTursoClient().execute({
    sql: `select user_id, anime_json, status
          from user_anime_statuses
          where status in ('watching', 'planned')
          and anime_json like ?`,
    // broadcastDay フィールドが今日の曜日を含む行のみ取得（JSON like で粗くフィルタ）
    args: [`%"${todayJP}"%`]
  });

  const byUser = new Map<string, AnimeItem[]>();

  for (const row of result.rows) {
    const userId = String(row.user_id);
    let anime: AnimeItem;
    try {
      anime = JSON.parse(String(row.anime_json)) as AnimeItem;
    } catch {
      continue;
    }
    // broadcastDay が今日と一致するかを正確に確認
    if (anime.airing?.broadcastDay !== todayJP) continue;

    const list = byUser.get(userId) ?? [];
    list.push(anime);
    byUser.set(userId, list);
  }

  return byUser;
}

export async function POST(request: Request) {
  // Vercel Cron からの呼び出しは Authorization: Bearer <CRON_SECRET> で保護
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  // CRON_SECRET が未設定だとガードが丸ごとスキップされ誰でも呼べてしまうため、
  // 未設定時は常に拒否する(フェイルクローズ)。
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allSubs = await getAllSubscriptions();
  const allNativeTokens = await getAllNativePushTokens();

  if (allSubs.length === 0 && allNativeTokens.length === 0) {
    return NextResponse.json({ sent: 0, nativeSent: 0, message: "購読者なし" });
  }

  const todayAnimeByUser = await getTodayWatchingByUser();
  if (todayAnimeByUser.size === 0) {
    return NextResponse.json({ sent: 0, nativeSent: 0, message: "今日放送のアニメなし" });
  }

  const subsByUser = new Map<string, typeof allSubs>();
  for (const sub of allSubs) {
    const list = subsByUser.get(sub.userId) ?? [];
    list.push(sub);
    subsByUser.set(sub.userId, list);
  }

  const nativeTokensByUser = new Map<string, string[]>();
  for (const token of allNativeTokens) {
    const list = nativeTokensByUser.get(token.userId) ?? [];
    list.push(token.expoPushToken);
    nativeTokensByUser.set(token.userId, list);
  }

  let sent = 0;
  let expired = 0;
  let nativeSent = 0;
  let nativeExpired = 0;

  for (const [userId, animeList] of todayAnimeByUser) {
    const subs = subsByUser.get(userId);
    const nativeTokens = nativeTokensByUser.get(userId);

    if ((!subs || subs.length === 0) && (!nativeTokens || nativeTokens.length === 0)) {
      continue;
    }

    const titles = animeList.map((a) => a.title).join("、");
    const body =
      animeList.length === 1
        ? `「${titles}」が今日放送されます`
        : `${animeList.length}作品が今日放送されます: ${titles}`;

    if (subs?.length) {
      for (const sub of subs) {
        const result = await sendPushNotification(sub, {
          title: "今日の放送",
          body,
          url: "/watchlist"
        });

        if (result.ok) {
          sent++;
        } else if (result.error === "expired") {
          await removeSubscription(userId, sub.endpoint).catch(() => undefined);
          expired++;
        }
      }
    }

    if (nativeTokens?.length) {
      const nativeResult = await sendExpoPushNotifications(nativeTokens, {
        title: "今日の放送",
        body,
        url: "/watchlist"
      });
      nativeSent += nativeResult.sent;
      nativeExpired += nativeResult.expired;

      for (const token of nativeResult.expiredTokens) {
        await removeNativePushToken(userId, token).catch(() => undefined);
      }
    }
  }

  return NextResponse.json({ sent, expired, nativeSent, nativeExpired });
}

// GET でも呼べるように（Vercel Cron は GET を使う場合もある）
export const GET = POST;
