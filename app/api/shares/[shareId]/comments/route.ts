import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  assertOptionalIdempotencyKey,
  consumeWriteRateLimit,
} from "@/lib/api/write-admission";
import {
  WRITE_REQUEST_MALFORMED,
  assertSameOriginBrowserWrite,
  parseCommentWriteBody,
  readJsonWithByteLimit,
} from "@/lib/api/write-request-guard";
import { addComment, listComments } from "@/lib/shares";
import { getTursoClient } from "@/lib/turso";

function isSafeShareToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  return NextResponse.json({ comments: await listComments(shareId) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const user = session?.user;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const originDenied = assertSameOriginBrowserWrite(request);
  if (originDenied) return originDenied;

  const idempotencyDenied = assertOptionalIdempotencyKey(request);
  if (idempotencyDenied) return idempotencyDenied;

  const limited = consumeWriteRateLimit(request, {
    userId,
    policy: "comment",
  });
  if (limited) return limited;

  const { shareId } = await params;

  const parsed = await readJsonWithByteLimit<unknown>(request);
  if (!parsed.ok) return parsed.response;

  const commentBody = parseCommentWriteBody(parsed.data);
  if (!commentBody.ok) return commentBody.response;

  const body = commentBody.body.trim();

  if (!body || body.length > 1000) {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  try {
    const comment = await addComment({
      shareId,
      userId,
      userName: user?.name,
      userImage: user?.image,
      body,
    });

    return NextResponse.json({ comment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Comment failed";
    const status = message === "Share not found." ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
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
    policy: "commentDelete",
  });
  if (limited) return limited;

  const { shareId } = await params;
  const commentId = new URL(request.url).searchParams.get("commentId")?.trim() ?? "";

  if (!isSafeShareToken(shareId) || !isSafeShareToken(commentId)) {
    return NextResponse.json({ error: WRITE_REQUEST_MALFORMED }, { status: 400 });
  }

  const result = await getTursoClient().execute({
    sql: `delete from share_comments
          where comment_id = ? and share_id = ? and user_id = ?`,
    args: [commentId, shareId, userId],
  });

  if (!result.rowsAffected) {
    return NextResponse.json({ error: "コメントが見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
