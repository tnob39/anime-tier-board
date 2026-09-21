import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  WRITE_BODY_MAX_BYTES,
  consumeWriteRateLimit,
} from "@/lib/api/write-admission";
import {
  assertSameOriginBrowserWrite,
  readJsonWithByteLimit,
} from "@/lib/api/write-request-guard";
import { createShare, type SharedBoard } from "@/lib/shares";
import type { AnimeItem } from "@/lib/types";
import { SEASONS } from "@/lib/types";

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

  const originDenied = assertSameOriginBrowserWrite(request);
  if (originDenied) return originDenied;

  const limited = consumeWriteRateLimit(request, {
    userId,
    policy: "shareCreate",
  });
  if (limited) return limited;

  const parsed = await readJsonWithByteLimit<SharePayload>(
    request,
    WRITE_BODY_MAX_BYTES.share
  );
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

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
