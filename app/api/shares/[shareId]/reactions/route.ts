import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { consumeWriteRateLimit } from "@/lib/api/write-admission";
import {
  WRITE_JSON_MAX_BYTES,
  assertSameOriginBrowserWrite,
  parseReactionWriteBody,
  readJsonWithByteLimit,
} from "@/lib/api/write-request-guard";
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

  const originDenied = assertSameOriginBrowserWrite(request);
  if (originDenied) return originDenied;

  const limited = consumeWriteRateLimit(request, {
    userId,
    policy: "reaction",
  });
  if (limited) return limited;

  const { shareId } = await params;
  const parsed = await readJsonWithByteLimit<unknown>(request, WRITE_JSON_MAX_BYTES);
  if (!parsed.ok) return parsed.response;

  const reactionBody = parseReactionWriteBody(parsed.data);
  if (!reactionBody.ok) return reactionBody.response;

  const kind = reactionBody.kind.trim();

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
