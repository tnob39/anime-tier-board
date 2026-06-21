import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { getBoard, saveBoard } from "@/lib/boards";
import { AppError } from "@/lib/errors/app-error";
import { SEASONS, type AnimeSeason } from "@/lib/types";

const MAX_BOARD_PAYLOAD_BYTES = 300_000;

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
  const userId = await requireUserId();

  const rawBody = await request.text();
  if (rawBody.length > MAX_BOARD_PAYLOAD_BYTES) {
    throw new AppError({
      message: "送信データが大きすぎます。",
      status: 413,
      code: "VALIDATION",
      expose: true,
    });
  }

  let board: unknown;
  let expectedUpdatedAt: string | null | undefined;
  try {
    const parsed = JSON.parse(rawBody) as { board?: unknown; expectedUpdatedAt?: unknown };
    board = parsed.board;
    expectedUpdatedAt =
      typeof parsed.expectedUpdatedAt === "string" ? parsed.expectedUpdatedAt : null;
  } catch {
    throw new AppError({
      message: "JSONの形式が正しくありません。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }

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