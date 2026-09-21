import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FEEDBACK_FORBIDDEN_COLUMN_NAMES,
  FEEDBACK_SCHEMA_SQL_SNIPPET,
  buildFeedbackGithubIssueBody,
  buildFeedbackGithubMarker,
} from "../lib/feedback.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("schema snippet has no personal-identifying columns", () => {
  const sql = FEEDBACK_SCHEMA_SQL_SNIPPET.toLowerCase();
  for (const column of FEEDBACK_FORBIDDEN_COLUMN_NAMES) {
    // column name as a token (with surrounding spaces / commas / newlines)
    const pattern = new RegExp(`(?:^|\\s|,)${column}(?:\\s|,|$)`, "m");
    assert.equal(
      pattern.test(sql),
      false,
      `forbidden column present: ${column}`
    );
  }
  assert.match(sql, /feedback_requests/);
  assert.match(sql, /\blevel\b/);
  assert.match(sql, /\bbody\b/);
  assert.match(sql, /image_blob_url/);
  assert.match(sql, /github_issue_number/);
  assert.match(sql, /github_create_started_at/);
  assert.match(sql, /attempt_count/);
  assert.match(sql, /lease_owner/);
});

test("API route does not touch session/auth and does not log PII headers", () => {
  const route = readProjectFile("app/api/feedback/route.ts");
  assert.doesNotMatch(route, /auth\(|getServerSession|from\s+["']@\/auth|next-auth/);
  assert.doesNotMatch(route, /userId|user_id/);
  assert.doesNotMatch(route, /getSession|useSession|auth\(\s*\)/);
  assert.doesNotMatch(route, /x-forwarded-for|user-agent|headers\.get\(["']cookie/i);
  assert.doesNotMatch(route, /console\.(log|info|debug|error|warn)\(/);
  assert.match(route, /multipart\/form-data/);
  assert.match(route, /isAllowedFeedbackOrigin/);
  assert.match(route, /readFormDataWithByteLimit/);
  assert.match(route, /FEEDBACK_MULTIPART_MAX_BYTES/);
  assert.doesNotMatch(route, /request\.formData\s*\(/);
  // 匿名であることをコメントで明示
  assert.match(route, /session\/auth を参照しない|匿名/);
});

test("lib/feedback never persists original filename or auth identity", () => {
  const lib = readProjectFile("lib/feedback.ts");
  const shared = readProjectFile("lib/feedback-shared.ts");
  // 禁止列名リストの定義以外で original_filename を使わない
  const withoutForbiddenList = shared.replace(
    /export const FEEDBACK_FORBIDDEN_COLUMN_NAMES[\s\S]*?as const;/,
    ""
  );
  assert.doesNotMatch(withoutForbiddenList, /original_filename/);
  assert.doesNotMatch(lib, /imageEntry\.name|file\.name\b/);
  assert.doesNotMatch(shared, /imageEntry\.name|file\.name\b/);
  assert.doesNotMatch(lib, /getServerSession|from\s+["']@\/auth|next-auth/);
  assert.doesNotMatch(lib, /x-forwarded-for|req\.ip|headers\.get\(["']cookie/i);
  assert.match(lib, /createFeedbackBlobPathname|feedback\/\$\{/);
  assert.match(lib, /body = null/);
  assert.match(shared, /feedback-id:/);
});

test("cron route is fail-closed without CRON_SECRET and uses Bearer auth", () => {
  const cron = readProjectFile("app/api/cron/feedback-to-issues/route.ts");
  assert.match(cron, /CRON_SECRET is not configured/);
  assert.match(cron, /Bearer \$\{cronSecret\}/);
  assert.doesNotMatch(cron, /getServerSession|next-auth|userId/);
});

test("UI copy warns about GitHub public issues and no personal data", () => {
  const ui = readProjectFile("app/feedback/feedback-client.tsx");
  assert.match(ui, /GitHub Issues/);
  assert.match(ui, /個人情報/);
  assert.match(ui, /ログイン不要|匿名/);
  // 氏名・メールの入力欄は設けない（説明文での言及は可）
  assert.doesNotMatch(ui, /name=["']email["']|type=["']email["']/);
  assert.doesNotMatch(ui, /name=["']name["']|autoComplete=["']name["']/);
  assert.doesNotMatch(ui, /name=["']userId["']/);
  assert.match(ui, /アイデア|改善してほしい|困っている|重大な問題/);
});

test("GitHub issue body includes feedback-id marker and level label", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const body = buildFeedbackGithubIssueBody({
    id,
    level: "urgent",
    body: "重大な不具合の再現手順を匿名で共有します。",
    imageBlobUrl: "https://blob.example/feedback/abc.webp",
  });
  assert.match(body, new RegExp(buildFeedbackGithubMarker(id)));
  assert.match(body, /重大な問題/);
  assert.match(body, /feedback\/abc\.webp/);
  assert.doesNotMatch(body, /user@|@gmail|User-Agent|Cookie/i);
});

test("secondary nav links to /feedback", () => {
  const menu = readProjectFile("components/HamburgerMenu.tsx");
  assert.match(menu, /href:\s*["']\/feedback["']/);
  assert.match(menu, /利用者の声/);
});
