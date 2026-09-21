import { NextResponse } from "next/server";
import {
  FEEDBACK_MULTIPART_MAX_BYTES,
  isAllowedFeedbackOrigin,
  parseAndValidateFeedbackFormData,
  submitAnonymousFeedback,
} from "@/lib/feedback";
import { consumeWriteRateLimit } from "@/lib/api/write-admission";
import { readFormDataWithByteLimit } from "@/lib/api/write-request-guard";
import { withApiRoute } from "@/lib/api/with-api-route";
import { jsonValidationError } from "@/lib/errors/to-response";

export const runtime = "nodejs";

/**
 * 匿名フィードバック受付。
 * session/auth を参照しない。IP・UA・Cookie・元ファイル名は保存しない。
 */
async function postHandler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!isAllowedFeedbackOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limited = consumeWriteRateLimit(request, {
    policy: "feedback",
    requireIp: true,
  });
  if (limited) return limited;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonValidationError("multipart/form-data で送信してください。");
  }

  const body = await readFormDataWithByteLimit(
    request,
    FEEDBACK_MULTIPART_MAX_BYTES
  );
  if (!body.ok) return body.response;
  const formData = body.formData;

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
