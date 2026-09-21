import { NextResponse } from "next/server";
import { requireUserId, requireWriteIdentity } from "@/lib/api/auth-helpers";
import {
  WRITE_BODY_MAX_BYTES,
  admitCookieCapableWrite,
} from "@/lib/api/write-admission";
import { readJsonWithByteLimit } from "@/lib/api/write-request-guard";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
import { listStatuses, updateTrackingDetails, updateWatchRhythm, WATCH_RHYTHMS } from "@/lib/statuses";
import type { WatchRhythm } from "@/lib/statuses";

type TrackingPayload = {
  animeId?: string;
  favoriteLevel?: number | null;
  watchSlot?: string | null;
  notes?: string | null;
  watchRhythm?: WatchRhythm | null;
  watchedEpisodes?: number | null;
};

export const GET = withApiRoute("watchlist.GET", async () => {
  const userId = await requireUserId();
  return NextResponse.json({ items: await listStatuses(userId) });
});

export const PUT = withApiRoute("watchlist.PUT", async (request: Request) => {
  const identity = await requireWriteIdentity();
  const denied = admitCookieCapableWrite(request, identity, "userWrite");
  if (denied) return denied;
  const userId = identity.userId;

  const parsed = await readJsonWithByteLimit<TrackingPayload>(
    request,
    WRITE_BODY_MAX_BYTES.watchlist
  );
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

  if (!payload.animeId) {
    throw new AppError({
      message: "視聴管理の内容が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  if (payload.watchRhythm !== undefined) {
    const rhythm = payload.watchRhythm;
    if (rhythm !== null && !WATCH_RHYTHMS.includes(rhythm)) {
      throw new AppError({
        message: "watchRhythmの値が不正です。",
        status: 400,
        code: "VALIDATION",
        expose: true,
      });
    }
    await updateWatchRhythm({ userId, animeId: payload.animeId, watchRhythm: rhythm ?? null });
  } else {
    await updateTrackingDetails({
      userId,
      animeId: payload.animeId,
      favoriteLevel: payload.favoriteLevel ?? null,
      watchSlot: payload.watchSlot ?? null,
      notes: payload.notes ?? null,
      watchedEpisodes: payload.watchedEpisodes ?? null,
    });
  }

  return NextResponse.json({ ok: true });
});