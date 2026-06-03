import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isReactionKind, setReaction } from "@/lib/shares";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shareId } = await params;
  let payload: { kind?: string };
  try {
    payload = (await request.json()) as { kind?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = payload.kind?.trim();

  if (!kind || !isReactionKind(kind)) {
    return NextResponse.json({ error: "Invalid reaction kind" }, { status: 400 });
  }

  try {
    return NextResponse.json(await setReaction(shareId, userId, kind));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reaction failed";
    const status = message === "Share not found." ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
