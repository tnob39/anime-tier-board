/** クライアント/サーバー共有のフィードバック定数・純関数（Node 専用依存なし）。 */

export const FEEDBACK_LEVELS = ["idea", "improvement", "problem", "urgent"] as const;
export type FeedbackLevel = (typeof FEEDBACK_LEVELS)[number];

export const FEEDBACK_LEVEL_LABELS: Record<FeedbackLevel, string> = {
  idea: "アイデア",
  improvement: "改善してほしい",
  problem: "困っている",
  urgent: "重大な問題",
};

export const FEEDBACK_STATUSES = [
  "pending",
  "processing",
  "published",
  "failed",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_BODY_MIN = 10;
export const FEEDBACK_BODY_MAX = 2000;
export const FEEDBACK_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const FEEDBACK_ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type FeedbackImageMime = (typeof FEEDBACK_ALLOWED_IMAGE_MIME)[number];

/** フォームの honeypot フィールド名（人間には非表示）。 */
export const FEEDBACK_HONEYPOT_FIELD = "company";

/** GitHub Issue 本文の冪等化マーカー接頭辞。 */
export const FEEDBACK_GITHUB_MARKER_PREFIX = "feedback-id:";

export const FEEDBACK_CRON_BATCH_LIMIT = 10;
export const FEEDBACK_MAX_ATTEMPTS = 8;
export const FEEDBACK_LEASE_MS = 5 * 60 * 1000;

/**
 * GitHub create 成功〜DB 更新前の部分成功窓向け。
 * Hobby互換の毎日cronを複数回跨いでGitHub Searchの反映を確認できる72時間は、
 * 再 create せずreconcileのみに限定する。
 */
export const FEEDBACK_RECONCILE_WINDOW_MS = 72 * 60 * 60 * 1000;
/** reconcile 中の search 回数（eventual consistency 対策）。 */
export const FEEDBACK_RECONCILE_SEARCH_COUNT = 3;

/** multipart 全体の上限（画像 3MB + フィールド余裕）。 */
export const FEEDBACK_MULTIPART_MAX_BYTES = FEEDBACK_IMAGE_MAX_BYTES + 64 * 1024;

export type FeedbackContentLengthResult =
  | { ok: true; size: number }
  | { ok: false; status: 411 | 400; message: string };

/**
 * multipart 受信前の Content-Length 検証。
 * 欠落は 411、不正値・非正整数は 400、上限超過は 400。
 */
export function validateFeedbackContentLength(
  contentLengthHeader: string | null
): FeedbackContentLengthResult {
  if (contentLengthHeader == null || contentLengthHeader.trim() === "") {
    return {
      ok: false,
      status: 411,
      message: "Content-Length が必要です。",
    };
  }
  const raw = contentLengthHeader.trim();
  // 有限の正整数のみ（指数表記・小数・符号を拒否）
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      status: 400,
      message: "Content-Length が不正です。",
    };
  }
  const size = Number(raw);
  if (!Number.isFinite(size) || !Number.isInteger(size) || size <= 0) {
    return {
      ok: false,
      status: 400,
      message: "Content-Length が不正です。",
    };
  }
  if (size > FEEDBACK_MULTIPART_MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      message: "送信データが大きすぎます。",
    };
  }
  return { ok: true, size };
}

export const DEFAULT_ALLOWED_FEEDBACK_ORIGINS = [
  "https://anime-tier-board.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

/** 個人識別に使われてはならない列名（契約検査用）。 */
export const FEEDBACK_FORBIDDEN_COLUMN_NAMES = [
  "name",
  "email",
  "user_id",
  "userid",
  "ip",
  "ip_address",
  "user_agent",
  "useragent",
  "cookie",
  "device_id",
  "deviceid",
  "original_filename",
  "filename",
  "file_name",
] as const;

export function isFeedbackLevel(value: unknown): value is FeedbackLevel {
  return typeof value === "string" && (FEEDBACK_LEVELS as readonly string[]).includes(value);
}

export function buildFeedbackGithubMarker(feedbackId: string): string {
  return `${FEEDBACK_GITHUB_MARKER_PREFIX} ${feedbackId}`;
}

export function extractFeedbackIdFromMarkerText(text: string): string | null {
  const match = text.match(/feedback-id:\s*([0-9a-fA-F-]{36})/);
  return match?.[1] ?? null;
}

export function normalizeFeedbackBody(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.replace(/\r\n/g, "\n").trim();
}

export function validateFeedbackBody(body: string): string | null {
  if (body.length < FEEDBACK_BODY_MIN) {
    return `本文は${FEEDBACK_BODY_MIN}文字以上で入力してください。`;
  }
  if (body.length > FEEDBACK_BODY_MAX) {
    return `本文は${FEEDBACK_BODY_MAX}文字以内で入力してください。`;
  }
  return null;
}

export function validateFeedbackLevel(level: unknown): FeedbackLevel | null {
  if (!isFeedbackLevel(level)) {
    return null;
  }
  return level;
}

/** マジックバイトで JPEG/PNG/WebP を判定。元ファイル名は使わない。 */
export function detectImageMimeFromBytes(bytes: Uint8Array): FeedbackImageMime | null {
  if (bytes.length < 12) {
    return null;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  const riff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  const webp =
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (riff && webp) {
    return "image/webp";
  }
  return null;
}

export function validateFeedbackImageBytes(
  bytes: Uint8Array,
  declaredMime: string | null
): string | null {
  if (bytes.byteLength === 0) {
    return "画像が空です。";
  }
  if (bytes.byteLength > FEEDBACK_IMAGE_MAX_BYTES) {
    return "画像は3MB以下にしてください。";
  }
  const detected = detectImageMimeFromBytes(bytes);
  if (!detected) {
    return "画像は JPEG / PNG / WebP のみ対応しています。";
  }
  if (
    declaredMime &&
    declaredMime !== "application/octet-stream" &&
    !(FEEDBACK_ALLOWED_IMAGE_MIME as readonly string[]).includes(declaredMime)
  ) {
    return "画像は JPEG / PNG / WebP のみ対応しています。";
  }
  if (
    declaredMime &&
    (FEEDBACK_ALLOWED_IMAGE_MIME as readonly string[]).includes(declaredMime) &&
    declaredMime !== detected
  ) {
    return "画像の形式が正しくありません。";
  }
  return null;
}

export function buildFeedbackGithubIssueTitle(level: FeedbackLevel, feedbackId: string): string {
  const short = feedbackId.slice(0, 8);
  return `[利用者の声/${FEEDBACK_LEVEL_LABELS[level]}] ${short}`;
}

export function buildFeedbackGithubIssueBody(input: {
  id: string;
  level: FeedbackLevel;
  body: string;
  imageBlobUrl: string | null;
}): string {
  const marker = buildFeedbackGithubMarker(input.id);
  const lines = [
    "## 利用者の声（匿名）",
    "",
    `- 要望レベル: ${FEEDBACK_LEVEL_LABELS[input.level]}`,
    `- ${marker}`,
    "",
    "### 本文",
    "",
    input.body,
    "",
  ];
  if (input.imageBlobUrl) {
    lines.push("### 添付画像", "", `![feedback](${input.imageBlobUrl})`, "");
  }
  lines.push(
    "---",
    "この Issue は匿名フィードバックから自動生成されました。氏名・メール・IP 等の個人識別情報は収集していません。"
  );
  return lines.join("\n");
}

export function parseGithubFeedbackRepo(
  raw: string | null | undefined
): { owner: string; repo: string } | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  const match = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2] };
}
