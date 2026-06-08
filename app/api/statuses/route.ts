import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
import { deleteStatus, isViewingStatus, listStatuses, saveStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

const MAX_STATUS_PAYLOAD_BYTES = 80_000;

type StatusPayload = {
  animeId?: string;
  status?: string;
  anime?: AnimeItem;
};

export const GET = withApiRoute("statuses.GET", async () => {
  const userId = await requireUserId();
  return NextResponse.json({ statuses: await listStatuses(userId) });
});

export const PUT = withApiRoute("statuses.PUT", async (request: Request) => {
  const userId = await requireUserId();

  const rawBody = await request.text();
  if (rawBody.length > MAX_STATUS_PAYLOAD_BYTES) {
    throw new AppError({
      message: "送信データが大きすぎます。",
      status: 413,
      code: "VALIDATION",
      expose: true,
    });
  }

  let payload: StatusPayload;

  try {
    payload = JSON.parse(rawBody) as StatusPayload;
  } catch {
    throw new AppError({
      message: "JSONの形式が正しくありません。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  if (
    !payload.animeId ||
    !payload.status ||
    !isViewingStatus(payload.status) ||
    !payload.anime ||
    payload.anime.id !== payload.animeId
  ) {
    throw new AppError({
      message: "ステータスの内容が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  await saveStatus({
    userId,
    animeId: payload.animeId,
    status: payload.status,
    anime: payload.anime,
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = withApiRoute("statuses.DELETE", async (request: Request) => {
  const userId = await requireUserId();

  const url = new URL(request.url);
  const animeId = url.searchParams.get("animeId")?.trim();

  if (!animeId) {
    throw new AppError({
      message: "animeId が指定されていません。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  await deleteStatus(userId, animeId);
  return NextResponse.json({ ok: true });
});