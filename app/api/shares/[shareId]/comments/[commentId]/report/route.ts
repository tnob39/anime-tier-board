import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  consumeWriteRateLimit,
  WRITE_BODY_MAX_BYTES,
} from "@/lib/api/write-admission";
import {
  COMMENT_NOT_FOUND,
  COMMENT_OPERATION_FAILED,
  assertSameOriginBrowserWrite,
  parseCommentReportBody,
  readJsonWithByteLimit,
} from "@/lib/api/write-request-guard";
import { reportComment } from "@/lib/shares";

const SELF_REPORT_ERROR = "自分のコメントは報告できません。";

function isSafeShareToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

type ReportPostSession = {
  user?: { id?: string | null } | null;
} | null;

export type ReportPostDependencies = {
  getSession: () => Promise<ReportPostSession>;
  assertSameOrigin: typeof assertSameOriginBrowserWrite;
  consumeRateLimit: typeof consumeWriteRateLimit;
  readJson: typeof readJsonWithByteLimit;
  parseBody: typeof parseCommentReportBody;
  reportComment: typeof reportComment;
};

export function createReportPostHandler(
  overrides: Partial<ReportPostDependencies> = {}
) {
  const dependencies: ReportPostDependencies = {
    getSession: auth,
    assertSameOrigin: assertSameOriginBrowserWrite,
    consumeRateLimit: consumeWriteRateLimit,
    readJson: readJsonWithByteLimit,
    parseBody: parseCommentReportBody,
    reportComment,
    ...overrides,
  };

  return async function POST(
    request: Request,
    { params }: { params: Promise<{ shareId: string; commentId: string }> }
  ) {
    const session = await dependencies.getSession();
    const userId = (session?.user as { id?: string } | undefined)?.id?.trim();

    if (!userId) {
      return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
    }

    const originDenied = dependencies.assertSameOrigin(request);
    if (originDenied) return originDenied;

    const limited = await dependencies.consumeRateLimit(request, {
      userId,
      policy: "commentReport",
      requireIp: true,
    });
    if (limited) return limited;

    const { shareId, commentId } = await params;
    if (!isSafeShareToken(shareId) || !isSafeShareToken(commentId)) {
      return NextResponse.json({ error: COMMENT_NOT_FOUND }, { status: 404 });
    }

    const parsed = await dependencies.readJson<unknown>(
      request,
      WRITE_BODY_MAX_BYTES.commentReport
    );
    if (!parsed.ok) return parsed.response;

    const reportBody = dependencies.parseBody(parsed.data);
    if (!reportBody.ok) return reportBody.response;

    try {
      const result = await dependencies.reportComment({
        shareId,
        commentId,
        reporterUserId: userId,
        reason: reportBody.reason,
        detail: reportBody.detail,
      });

      if (result.outcome === "not_found") {
        return NextResponse.json({ error: COMMENT_NOT_FOUND }, { status: 404 });
      }
      if (result.outcome === "self") {
        return NextResponse.json({ error: SELF_REPORT_ERROR }, { status: 403 });
      }

      return NextResponse.json({
        ok: true,
        duplicate: result.outcome === "duplicate",
        hidden: result.hidden,
      });
    } catch {
      return NextResponse.json({ error: COMMENT_OPERATION_FAILED }, { status: 500 });
    }
  };
}

export const POST = createReportPostHandler();
