import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listStatuses, updateTrackingDetails } from "@/lib/statuses";

const MAX_TRACKING_PAYLOAD_BYTES = 20_000;

type TrackingPayload = {
  animeId?: string;
  favoriteLevel?: number | null;
  watchSlot?: string | null;
  notes?: string | null;
};

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ items: await listStatuses(userId) });
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_TRACKING_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Tracking payload too large" }, { status: 413 });
  }

  let payload: TrackingPayload;

  try {
    payload = JSON.parse(rawBody) as TrackingPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.animeId) {
    return NextResponse.json({ error: "Invalid tracking payload" }, { status: 400 });
  }

  await updateTrackingDetails({
    userId,
    animeId: payload.animeId,
    favoriteLevel: payload.favoriteLevel ?? null,
    watchSlot: payload.watchSlot ?? null,
    notes: payload.notes ?? null
  });

  return NextResponse.json({ ok: true });
}
