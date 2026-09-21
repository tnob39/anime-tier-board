import { NextResponse } from "next/server";
import { requireUserId, requireWriteIdentity } from "@/lib/api/auth-helpers";
import {
  WRITE_BODY_MAX_BYTES,
  admitCookieCapableWrite,
} from "@/lib/api/write-admission";
import { readJsonWithByteLimit } from "@/lib/api/write-request-guard";
import { withApiRoute } from "@/lib/api/with-api-route";
import { getBoard, saveBoard } from "@/lib/boards";
import { AppError } from "@/lib/errors/app-error";
import { SEASONS, type AnimeSeason } from "@/lib/types";

export const GET = withApiRoute("boards.GET", async (request: Request) => {
  const userId = await requireUserId();

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const season = url.searchParams.get("season") as AnimeSeason | null;
  if (!Number.isInteger(year) || !season || !SEASONS.includes(season)) {
    throw new AppError({
      message: "ボードの指定が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  return NextResponse.json({ board: await getBoard(userId, year, season) });
});

export const PUT = withApiRoute("boards.PUT", async (request: Request) => {
  const identity = await requireWriteIdentity();
  const denied = admitCookieCapableWrite(request, identity, "userWrite");
  if (denied) return denied;
  const userId = identity.userId;

  const parsed = await readJsonWithByteLimit<{
    board?: unknown;
    expectedUpdatedAt?: unknown;
  }>(request, WRITE_BODY_MAX_BYTES.board);
  if (!parsed.ok) return parsed.response;
  const board = parsed.data.board;
  const expectedUpdatedAt =
    typeof parsed.data.expectedUpdatedAt === "string"
      ? parsed.data.expectedUpdatedAt
      : null;

  const candidate = board as { season?: AnimeSeason } | null;
  if (!candidate?.season || !SEASONS.includes(candidate.season)) {
    throw new AppError({
      message: "ボードの内容が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

  const result = await saveBoard(userId, board as Parameters<typeof saveBoard>[1], {
    expectedUpdatedAt
  });

  if (result === "conflict") {
    throw new AppError({
      message: "別の端末で更新されたため、保存できませんでした。",
      status: 409,
      code: "VALIDATION",
      expose: true
    });
  }

  return NextResponse.json({ ok: true });
});