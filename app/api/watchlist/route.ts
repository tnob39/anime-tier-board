import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
import { listStatuses, updateTrackingDetails } from "@/lib/statuses";

const MAX_TRACKING_PAYLOAD_BYTES = 20_000;

type TrackingPayload = {
  animeId?: string;
  favoriteLevel?: number | null;
  watchSlot?: string | null;
  notes?: string | null;
};

export const GET = withApiRoute("watchlist.GET", async () => {
  const userId = await requireUserId();
  return NextResponse.json({ items: await listStatuses(userId) });
});

export const PUT = withApiRoute("watchlist.PUT", async (request: Request) => {
  const userId = await requireUserId();

  const rawBody = await request.text();
  if (rawBody.length > MAX_TRACKING_PAYLOAD_BYTES) {
    throw new AppError({
      message: "送信データが大きすぎます。",
      status: 413,
      code: "VALIDATION",
      expose: true,
    });
  }

  let payload: TrackingPayload;

  try {
    payload = JSON.parse(rawBody) as TrackingPayload;
  } catch {
    throw new AppError({
      message: "JSONの形式が正しくありません。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  if (!payload.animeId) {
    throw new AppError({
      message: "視聴管理の内容が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  await updateTrackingDetails({
    userId,
    animeId: payload.animeId,
    favoriteLevel: payload.favoriteLevel ?? null,
    watchSlot: payload.watchSlot ?? null,
    notes: payload.notes ?? null,
  });

  return NextResponse.json({ ok: true });
});