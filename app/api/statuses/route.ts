import { NextResponse } from "next/server";
import { requireUserId, requireWriteIdentity } from "@/lib/api/auth-helpers";
import {
  WRITE_BODY_MAX_BYTES,
  admitCookieCapableWrite,
} from "@/lib/api/write-admission";
import { readJsonWithByteLimit } from "@/lib/api/write-request-guard";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
import { deleteStatus, isViewingStatus, listStatuses, saveStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

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
  const identity = await requireWriteIdentity();
  const denied = admitCookieCapableWrite(request, identity, "userWrite");
  if (denied) return denied;
  const userId = identity.userId;

  const parsed = await readJsonWithByteLimit<StatusPayload>(
    request,
    WRITE_BODY_MAX_BYTES.status
  );
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

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
  const identity = await requireWriteIdentity();
  const denied = admitCookieCapableWrite(request, identity, "userWrite");
  if (denied) return denied;
  const userId = identity.userId;

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