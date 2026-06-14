import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSurveyResults,
  saveSurveyResponse,
  type SurveyAnswers
} from "@/lib/survey";

export async function GET() {
  const results = await getSurveyResults();
  return NextResponse.json(results);
}

export async function POST(request: Request) {
  let body: { respondentId?: unknown; answers?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const respondentId =
    typeof body.respondentId === "string" ? body.respondentId.slice(0, 64) : "";
  if (!respondentId) {
    return NextResponse.json({ error: "respondentId is required" }, { status: 400 });
  }

  const answers = (body.answers ?? {}) as SurveyAnswers;

  // ログイン中ならひも付け（任意）
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  await saveSurveyResponse({ respondentId, userId, answers });

  const results = await getSurveyResults();
  return NextResponse.json(results);
}
