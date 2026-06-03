import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createShare, type SharedBoard } from "@/lib/shares";
import type { AnimeItem } from "@/lib/types";
import { SEASONS } from "@/lib/types";

const MAX_SHARE_PAYLOAD_BYTES = 800_000;

type SharePayload = {
  board?: SharedBoard;
  items?: AnimeItem[];
};

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_SHARE_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Share payload too large" }, { status: 413 });
  }

  let payload: SharePayload;

  try {
    payload = JSON.parse(rawBody) as SharePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !isSharedBoard(payload.board) ||
    !Array.isArray(payload.items) ||
    payload.items.length > 300
  ) {
    return NextResponse.json({ error: "Invalid share payload" }, { status: 400 });
  }

  const shareId = await createShare(userId, payload.board, payload.items);

  return NextResponse.json({ shareId });
}

function isSharedBoard(value: unknown): value is SharedBoard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const board = value as Partial<SharedBoard>;

  return (
    typeof board.version === "number" &&
    typeof board.seasonYear === "number" &&
    typeof board.season === "string" &&
    SEASONS.includes(board.season) &&
    typeof board.updatedAt === "string" &&
    Array.isArray(board.tiers) &&
    board.tiers.length <= 20
  );
}
