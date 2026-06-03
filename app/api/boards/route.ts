import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBoard, saveBoard } from "@/lib/boards";
import { SEASONS, type AnimeSeason } from "@/lib/types";

const MAX_BOARD_PAYLOAD_BYTES = 300_000;

export async function GET(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const season = url.searchParams.get("season") as AnimeSeason | null;
  if (!Number.isInteger(year) || !season || !SEASONS.includes(season)) {
    return NextResponse.json({ error: "Invalid board key" }, { status: 400 });
  }

  return NextResponse.json({ board: await getBoard(userId, year, season) });
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BOARD_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Board payload too large" }, { status: 413 });
  }

  let board: unknown;
  try {
    board = (JSON.parse(rawBody) as { board?: unknown }).board;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const candidate = board as { season?: AnimeSeason } | null;
  if (!candidate?.season || !SEASONS.includes(candidate.season)) {
    return NextResponse.json({ error: "Invalid board" }, { status: 400 });
  }

  await saveBoard(userId, board as Parameters<typeof saveBoard>[1]);
  return NextResponse.json({ ok: true });
}
