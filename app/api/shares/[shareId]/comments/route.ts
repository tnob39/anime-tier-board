import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  assertOptionalIdempotencyKey,
  consumeWriteRateLimit,
  WRITE_BODY_MAX_BYTES,
} from "@/lib/api/write-admission";
import {
  COMMENT_NOT_FOUND,
  COMMENT_OPERATION_FAILED,
  WRITE_REQUEST_MALFORMED,
  assertSameOriginBrowserWrite,
  parseCommentWriteBody,
  readJsonWithByteLimit,
} from "@/lib/api/write-request-guard";
import { addComment, listComments, moderateComment } from "@/lib/shares";

function isSafeShareToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

type CommentDeleteSession = {
  user?: { id?: string | null } | null;
} | null;

export type CommentsDeleteDependencies = {
  getSession: () => Promise<CommentDeleteSession>;
  assertSameOrigin: typeof assertSameOriginBrowserWrite;
  consumeRateLimit: typeof consumeWriteRateLimit;
  moderateComment: typeof moderateComment;
};

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
  const userId = (session?.user as { id?: string } | undefined)?.id?.trim();
  const user = session?.user;

  if (!userId) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
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
  const parsed = await readJsonWithByteLimit<unknown>(
    request,
    WRITE_BODY_MAX_BYTES.comment
  );
  if (!parsed.ok) return parsed.response;

  const commentBody = parseCommentWriteBody(parsed.data);
  if (!commentBody.ok) return commentBody.response;

  const body = commentBody.body.trim();
  if (!body || body.length > 1000) {
    return NextResponse.json({ error: "コメントの内容が正しくありません。" }, { status: 400 });
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
    const isMissingShare = error instanceof Error && error.message === "Share not found.";
    return NextResponse.json(
      { error: isMissingShare ? "共有が見つかりません。" : COMMENT_OPERATION_FAILED },
      { status: isMissingShare ? 404 : 500 }
    );
  }
}

export function createCommentsDeleteHandler(
  overrides: Partial<CommentsDeleteDependencies> = {}
) {
  const dependencies: CommentsDeleteDependencies = {
    getSession: auth,
    assertSameOrigin: assertSameOriginBrowserWrite,
    consumeRateLimit: consumeWriteRateLimit,
    moderateComment,
    ...overrides,
  };

  return async function DELETE(
    request: Request,
    { params }: { params: Promise<{ shareId: string }> }
  ) {
    const { shareId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const commentId = searchParams.get("commentId")?.trim() ?? "";
    const rawAction = searchParams.get("action");
    const action = rawAction === null || rawAction === "delete" ? "delete" : rawAction;

    const session = await dependencies.getSession();
    const userId = (session?.user as { id?: string } | undefined)?.id?.trim();

    if (!userId) {
      if (action === "hide") {
        return NextResponse.json({ error: COMMENT_NOT_FOUND }, { status: 404 });
      }
      return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
    }

    const originDenied = dependencies.assertSameOrigin(request);
    if (originDenied) return originDenied;

    const limited = dependencies.consumeRateLimit(request, {
      userId,
      policy: action === "hide" ? "commentModeration" : "commentDelete",
      requireIp: action === "hide",
    });
    if (limited) return limited;

    if (
      !isSafeShareToken(shareId) ||
      !isSafeShareToken(commentId) ||
      (action !== "delete" && action !== "hide")
    ) {
      return NextResponse.json({ error: WRITE_REQUEST_MALFORMED }, { status: 400 });
    }

    try {
      // moderateComment executes delete from share_comments transactionally.
      const result = await dependencies.moderateComment({
        shareId,
        commentId,
        actorUserId: userId,
        action,
      });

      // Do not reveal whether a valid comment exists to an unauthorized actor.
      if (result.outcome === "not_found" || result.outcome === "forbidden") {
        return NextResponse.json({ error: COMMENT_NOT_FOUND }, { status: 404 });
      }

      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: COMMENT_OPERATION_FAILED }, { status: 500 });
    }
  };
}

const deleteHandler = createCommentsDeleteHandler();

export async function DELETE(
  request: Request,
  context: { params: Promise<{ shareId: string }> }
) {
  return deleteHandler(request, context);
}
