import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteStatus, isViewingStatus, listStatuses, saveStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

const MAX_STATUS_PAYLOAD_BYTES = 80_000;

type StatusPayload = {
  animeId?: string;
  status?: string;
  anime?: AnimeItem;
};

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ statuses: await listStatuses(userId) });
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_STATUS_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Status payload too large" }, { status: 413 });
  }

  let payload: StatusPayload;

  try {
    payload = JSON.parse(rawBody) as StatusPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !payload.animeId ||
    !payload.status ||
    !isViewingStatus(payload.status) ||
    !payload.anime ||
    payload.anime.id !== payload.animeId
  ) {
    return NextResponse.json({ error: "Invalid status payload" }, { status: 400 });
  }

  await saveStatus({
    userId,
    animeId: payload.animeId,
    status: payload.status,
    anime: payload.anime
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const animeId = url.searchParams.get("animeId")?.trim();

  if (!animeId) {
    return NextResponse.json({ error: "Invalid status key" }, { status: 400 });
  }

  await deleteStatus(userId, animeId);
  return NextResponse.json({ ok: true });
}
