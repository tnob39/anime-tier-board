import { NextResponse } from "next/server";
import {
  isAllowedFeedbackOrigin,
  parseAndValidateFeedbackFormData,
  submitAnonymousFeedback,
  validateFeedbackContentLength,
} from "@/lib/feedback";
import { withApiRoute } from "@/lib/api/with-api-route";
import { jsonValidationError } from "@/lib/errors/to-response";

export const runtime = "nodejs";

/**
 * 匿名フィードバック受付。
 * session/auth を参照しない。IP・UA・Cookie・元ファイル名は保存しない。
 */
async function postHandler(request: Request): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (!isAllowedFeedbackOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonValidationError("multipart/form-data で送信してください。");
  }

  // formData パース前に Content-Length を必須検証（欠落で全体上限を回避させない）
  const contentLengthCheck = validateFeedbackContentLength(
    request.headers.get("content-length")
  );
  if (!contentLengthCheck.ok) {
    if (contentLengthCheck.status === 411) {
      return NextResponse.json(
        {
          error: contentLengthCheck.message,
          code: "VALIDATION" as const,
          requestId: crypto.randomUUID(),
        },
        { status: 411 }
      );
    }
    return jsonValidationError(contentLengthCheck.message);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonValidationError("送信データを読み取れませんでした。");
  }

  const parsed = await parseAndValidateFeedbackFormData(formData);
  if (parsed.kind === "honeypot") {
    // ボットには成功と同様の応答（詳細を与えない）
    return NextResponse.json({ ok: true });
  }
  if (parsed.kind === "validation") {
    return jsonValidationError(parsed.message);
  }

  const result = await submitAnonymousFeedback({
    validated: parsed.value,
  });

  if (result.kind === "honeypot") {
    return NextResponse.json({ ok: true });
  }
  if (result.kind === "validation") {
    return jsonValidationError(result.message);
  }

  // 本文・画像 URL はレスポンスにもログにも出さない
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}

export const POST = withApiRoute("POST /api/feedback", postHandler);
