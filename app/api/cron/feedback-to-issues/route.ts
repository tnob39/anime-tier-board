import { NextResponse } from "next/server";
import {
  createGithubFeedbackClient,
  parseGithubFeedbackRepo,
  runFeedbackToIssuesCron,
} from "@/lib/feedback";

export const runtime = "nodejs";

/**
 * pending フィードバックを GitHub Issue 化する cron。
 * CRON_SECRET 未設定は fail closed。
 */
async function handler(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GITHUB_FEEDBACK_TOKEN?.trim();
  const repoRaw = process.env.GITHUB_FEEDBACK_REPO?.trim();
  const repo = parseGithubFeedbackRepo(repoRaw);

  if (!token || !repo) {
    return NextResponse.json(
      { error: "GitHub feedback credentials are not configured" },
      { status: 500 }
    );
  }

  const github = createGithubFeedbackClient({
    token,
    owner: repo.owner,
    repo: repo.repo,
  });

  const result = await runFeedbackToIssuesCron({ github });
  return NextResponse.json(result);
}

export const POST = handler;
export const GET = handler;
