import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { getTursoClient } from "./turso.ts";
import { AppError } from "./errors/app-error.ts";
import {
  DEFAULT_ALLOWED_FEEDBACK_ORIGINS,
  FEEDBACK_BODY_MIN,
  FEEDBACK_CRON_BATCH_LIMIT,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_LEASE_MS,
  FEEDBACK_MAX_ATTEMPTS,
  FEEDBACK_RECONCILE_SEARCH_COUNT,
  FEEDBACK_RECONCILE_WINDOW_MS,
  FEEDBACK_STATUSES,
  buildFeedbackGithubIssueBody,
  buildFeedbackGithubIssueTitle,
  buildFeedbackGithubMarker,
  isFeedbackLevel,
  normalizeFeedbackBody,
  validateFeedbackBody,
  validateFeedbackImageBytes,
  validateFeedbackLevel,
  type FeedbackLevel,
  type FeedbackStatus,
} from "./feedback-shared.ts";

export {
  DEFAULT_ALLOWED_FEEDBACK_ORIGINS,
  FEEDBACK_BODY_MAX,
  FEEDBACK_BODY_MIN,
  FEEDBACK_CRON_BATCH_LIMIT,
  FEEDBACK_FORBIDDEN_COLUMN_NAMES,
  FEEDBACK_GITHUB_MARKER_PREFIX,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_LEASE_MS,
  FEEDBACK_LEVEL_LABELS,
  FEEDBACK_LEVELS,
  FEEDBACK_MAX_ATTEMPTS,
  FEEDBACK_MULTIPART_MAX_BYTES,
  FEEDBACK_RECONCILE_SEARCH_COUNT,
  FEEDBACK_RECONCILE_WINDOW_MS,
  FEEDBACK_ALLOWED_IMAGE_MIME,
  FEEDBACK_STATUSES,
  buildFeedbackGithubIssueBody,
  buildFeedbackGithubIssueTitle,
  buildFeedbackGithubMarker,
  detectImageMimeFromBytes,
  extractFeedbackIdFromMarkerText,
  isFeedbackLevel,
  normalizeFeedbackBody,
  parseGithubFeedbackRepo,
  validateFeedbackBody,
  validateFeedbackContentLength,
  validateFeedbackImageBytes,
  validateFeedbackLevel,
  type FeedbackContentLengthResult,
  type FeedbackImageMime,
  type FeedbackLevel,
  type FeedbackStatus,
} from "./feedback-shared.ts";

export type FeedbackRequestRow = {
  id: string;
  level: FeedbackLevel;
  body: string | null;
  imageBlobUrl: string | null;
  imageBlobPathname: string | null;
  status: FeedbackStatus;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  /** GitHub create を開始した時刻（部分成功窓の reconcile 用）。 */
  githubCreateStartedAt: string | null;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ValidatedFeedbackInput = {
  level: FeedbackLevel;
  body: string;
  /** honeypot が埋まっている場合 true。保存せず成功応答する。 */
  honeypotTriggered: boolean;
  image: {
    bytes: Uint8Array;
    declaredMime: string | null;
  } | null;
};

export type FeedbackParseResult =
  | { kind: "ok"; value: ValidatedFeedbackInput }
  | { kind: "honeypot" }
  | { kind: "validation"; message: string };

export type FeedbackSubmitResult =
  | { kind: "accepted"; id: string }
  | { kind: "honeypot" }
  | { kind: "validation"; message: string };

export type GithubIssueRecord = {
  number: number;
  htmlUrl: string;
};

export type GithubFeedbackClient = {
  findIssueByFeedbackId: (feedbackId: string) => Promise<GithubIssueRecord | null>;
  createIssue: (input: {
    title: string;
    body: string;
  }) => Promise<GithubIssueRecord>;
};

export type BlobStore = {
  putWebp: (pathname: string, bytes: Uint8Array) => Promise<{ url: string; pathname: string }>;
  del: (url: string) => Promise<void>;
};

type FeedbackOriginEnv = {
  AUTH_URL?: string | null;
  VERCEL_URL?: string | null;
  CORS_ALLOWED_ORIGINS?: string | null;
};

function readFeedbackOriginEnv(env?: FeedbackOriginEnv): FeedbackOriginEnv {
  return (
    env ?? {
      AUTH_URL: process.env.AUTH_URL,
      VERCEL_URL: process.env.VERCEL_URL,
      CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
    }
  );
}

let feedbackSchemaReady: Promise<void> | null = null;

export function isAllowedFeedbackOrigin(
  originHeader: string | null,
  env?: FeedbackOriginEnv
): boolean {
  if (!originHeader) {
    return false;
  }
  const origin = normalizeOrigin(originHeader);
  return getAllowedFeedbackOrigins(env).has(origin);
}

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  return trimmed.endsWith("/") && !trimmed.endsWith("://")
    ? trimmed.slice(0, -1)
    : trimmed;
}

export function getAllowedFeedbackOrigins(env?: FeedbackOriginEnv): Set<string> {
  const resolved = readFeedbackOriginEnv(env);
  const configured = (resolved.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const authUrl = resolved.AUTH_URL?.trim();
  const vercelUrl = resolved.VERCEL_URL?.trim();
  const siteOrigin = authUrl
    ? normalizeOrigin(authUrl)
    : vercelUrl
      ? `https://${normalizeOrigin(vercelUrl)}`
      : null;

  return new Set(
    [
      ...DEFAULT_ALLOWED_FEEDBACK_ORIGINS,
      ...(siteOrigin ? [siteOrigin] : []),
      ...configured,
    ]
      .map(normalizeOrigin)
      .filter(Boolean)
  );
}

/**
 * multipart FormData から入力を検証する。
 * 個人情報フィールドは受理しない。
 */
export async function parseAndValidateFeedbackFormData(
  formData: FormData
): Promise<FeedbackParseResult> {
  const honeypot = String(formData.get(FEEDBACK_HONEYPOT_FIELD) ?? "").trim();
  if (honeypot.length > 0) {
    return { kind: "honeypot" };
  }

  for (const forbidden of ["name", "email", "userId", "user_id", "phone"]) {
    const value = formData.get(forbidden);
    if (typeof value === "string" && value.trim().length > 0) {
      return { kind: "validation", message: "不正な入力です。" };
    }
  }

  const levelRaw = formData.get("level");
  const level = validateFeedbackLevel(typeof levelRaw === "string" ? levelRaw : null);
  if (!level) {
    return { kind: "validation", message: "要望レベルを選択してください。" };
  }

  const body = normalizeFeedbackBody(formData.get("body"));
  const bodyError = validateFeedbackBody(body);
  if (bodyError) {
    return { kind: "validation", message: bodyError };
  }

  const imageEntry = formData.get("image");
  let image: ValidatedFeedbackInput["image"] = null;
  if (imageEntry instanceof File && imageEntry.size > 0) {
    // 元ファイル名は一切保持しない
    const buffer = new Uint8Array(await imageEntry.arrayBuffer());
    const declaredMime = imageEntry.type || null;
    const imageError = validateFeedbackImageBytes(buffer, declaredMime);
    if (imageError) {
      return { kind: "validation", message: imageError };
    }
    image = { bytes: buffer, declaredMime };
  } else if (imageEntry instanceof File && imageEntry.size === 0) {
    image = null;
  }

  return {
    kind: "ok",
    value: {
      level,
      body,
      honeypotTriggered: false,
      image,
    },
  };
}

/** EXIF/GPS を除去し WebP へ再エンコード。元ファイル名は使わない。 */
export async function reencodeFeedbackImageToWebp(
  bytes: Uint8Array
): Promise<Uint8Array> {
  try {
    const input = Buffer.from(bytes);
    const image = sharp(input, { failOn: "error", animated: false });
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      throw new AppError({
        message: "画像は JPEG / PNG / WebP のみ対応しています。",
        status: 400,
        code: "VALIDATION",
        expose: true,
      });
    }
    // rotate() で EXIF orientation を適用し、出力 WebP からメタデータを落とす
    const out = await image
      .rotate()
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return new Uint8Array(out);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError({
      message: "画像を処理できませんでした。別の画像をお試しください。",
      status: 400,
      code: "VALIDATION",
      expose: true,
    });
  }
}

export function createFeedbackBlobPathname(): string {
  return `feedback/${randomUUID()}.webp`;
}

export function createProductionBlobStore(): BlobStore {
  return {
    async putWebp(pathname, bytes) {
      const result = await put(pathname, Buffer.from(bytes), {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      });
      return { url: result.url, pathname: result.pathname };
    },
    async del(url) {
      await del(url);
    },
  };
}

export async function ensureFeedbackSchema(): Promise<void> {
  if (!feedbackSchemaReady) {
    feedbackSchemaReady = (async () => {
      const client = getTursoClient();
      await client.execute(`
        create table if not exists feedback_requests (
          id text primary key not null,
          level text not null,
          body text,
          image_blob_url text,
          image_blob_pathname text,
          status text not null,
          attempt_count integer not null default 0,
          lease_owner text,
          lease_expires_at text,
          github_create_started_at text,
          github_issue_number integer,
          github_issue_url text,
          last_error text,
          created_at text not null,
          updated_at text not null,
          published_at text
        )
      `);
      // 既存テーブル向け: 列が無ければ追加（IF NOT EXISTS は SQLite 3.35+）
      try {
        await client.execute(
          `alter table feedback_requests add column github_create_started_at text`
        );
      } catch {
        // 既に存在する列は無視
      }
      await client.execute(
        `create index if not exists feedback_requests_status_created_idx
         on feedback_requests (status, created_at)`
      );
    })().catch((error) => {
      feedbackSchemaReady = null;
      throw error;
    });
  }
  await feedbackSchemaReady;
}

/** テスト用: schema ready キャッシュをリセット */
export function resetFeedbackSchemaCacheForTests(): void {
  feedbackSchemaReady = null;
}

export async function insertFeedbackRequest(input: {
  id: string;
  level: FeedbackLevel;
  body: string;
  imageBlobUrl: string | null;
  imageBlobPathname: string | null;
  now?: Date;
}): Promise<void> {
  await ensureFeedbackSchema();
  const now = (input.now ?? new Date()).toISOString();
  await getTursoClient().execute({
    sql: `insert into feedback_requests (
      id, level, body, image_blob_url, image_blob_pathname,
      status, attempt_count, lease_owner, lease_expires_at,
      github_create_started_at, github_issue_number, github_issue_url, last_error,
      created_at, updated_at, published_at
    ) values (?, ?, ?, ?, ?, 'pending', 0, null, null, null, null, null, null, ?, ?, null)`,
    args: [
      input.id,
      input.level,
      input.body,
      input.imageBlobUrl,
      input.imageBlobPathname,
      now,
      now,
    ],
  });
}

export async function submitAnonymousFeedback(input: {
  validated: ValidatedFeedbackInput;
  blobStore?: BlobStore;
  now?: Date;
  idFactory?: () => string;
}): Promise<FeedbackSubmitResult> {
  if (input.validated.honeypotTriggered) {
    return { kind: "honeypot" };
  }

  const id = (input.idFactory ?? randomUUID)();
  const blobStore = input.blobStore ?? createProductionBlobStore();
  let uploadedUrl: string | null = null;
  let uploadedPathname: string | null = null;

  try {
    if (input.validated.image) {
      const webp = await reencodeFeedbackImageToWebp(input.validated.image.bytes);
      if (webp.byteLength > FEEDBACK_IMAGE_MAX_BYTES) {
        return {
          kind: "validation",
          message: "画像の処理後サイズが上限を超えました。別の画像をお試しください。",
        };
      }
      const pathname = createFeedbackBlobPathname();
      const putResult = await blobStore.putWebp(pathname, webp);
      uploadedUrl = putResult.url;
      uploadedPathname = putResult.pathname;
    }

    await insertFeedbackRequest({
      id,
      level: input.validated.level,
      body: input.validated.body,
      imageBlobUrl: uploadedUrl,
      imageBlobPathname: uploadedPathname,
      now: input.now,
    });

    return { kind: "accepted", id };
  } catch (error) {
    if (uploadedUrl) {
      try {
        await blobStore.del(uploadedUrl);
      } catch {
        // Blob 削除失敗は握りつぶす（DB 未保存が優先）
      }
    }
    throw error;
  }
}

function mapFeedbackRow(row: Record<string, unknown>): FeedbackRequestRow {
  const level = String(row.level);
  if (!isFeedbackLevel(level)) {
    throw new Error("invalid feedback level in database");
  }
  const status = String(row.status) as FeedbackStatus;
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
    throw new Error("invalid feedback status in database");
  }
  return {
    id: String(row.id),
    level,
    body: row.body == null ? null : String(row.body),
    imageBlobUrl: row.image_blob_url == null ? null : String(row.image_blob_url),
    imageBlobPathname:
      row.image_blob_pathname == null ? null : String(row.image_blob_pathname),
    status,
    attemptCount: Number(row.attempt_count ?? 0),
    leaseOwner: row.lease_owner == null ? null : String(row.lease_owner),
    leaseExpiresAt:
      row.lease_expires_at == null ? null : String(row.lease_expires_at),
    githubCreateStartedAt:
      row.github_create_started_at == null
        ? null
        : String(row.github_create_started_at),
    githubIssueNumber:
      row.github_issue_number == null ? null : Number(row.github_issue_number),
    githubIssueUrl:
      row.github_issue_url == null ? null : String(row.github_issue_url),
    lastError: row.last_error == null ? null : String(row.last_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedAt: row.published_at == null ? null : String(row.published_at),
  };
}

export async function listClaimableFeedbackIds(limit: number, now: Date): Promise<string[]> {
  await ensureFeedbackSchema();
  const nowIso = now.toISOString();
  const result = await getTursoClient().execute({
    sql: `select id from feedback_requests
          where (
            status = 'pending'
            or (status = 'failed' and attempt_count < ?)
            or (status = 'processing' and (lease_expires_at is null or lease_expires_at < ?))
          )
          order by created_at asc
          limit ?`,
    args: [FEEDBACK_MAX_ATTEMPTS, nowIso, limit],
  });
  return result.rows.map((row) => String(row.id));
}

/** 条件付き claim。成功時のみ行を返す。 */
export async function tryClaimFeedbackRequest(input: {
  id: string;
  leaseOwner: string;
  now: Date;
  leaseMs?: number;
}): Promise<FeedbackRequestRow | null> {
  await ensureFeedbackSchema();
  const nowIso = input.now.toISOString();
  const leaseMs = input.leaseMs ?? FEEDBACK_LEASE_MS;
  const leaseExpires = new Date(input.now.getTime() + leaseMs).toISOString();

  const update = await getTursoClient().execute({
    sql: `update feedback_requests
          set status = 'processing',
              lease_owner = ?,
              lease_expires_at = ?,
              attempt_count = attempt_count + 1,
              updated_at = ?,
              last_error = null
          where id = ?
            and attempt_count < ?
            and (
              status = 'pending'
              or status = 'failed'
              or (status = 'processing' and (lease_expires_at is null or lease_expires_at < ?))
            )`,
    args: [
      input.leaseOwner,
      leaseExpires,
      nowIso,
      input.id,
      FEEDBACK_MAX_ATTEMPTS,
      nowIso,
    ],
  });

  if ((update.rowsAffected ?? 0) < 1) {
    return null;
  }

  const selected = await getTursoClient().execute({
    sql: `select id, level, body, image_blob_url, image_blob_pathname, status,
                 attempt_count, lease_owner, lease_expires_at,
                 github_create_started_at,
                 github_issue_number, github_issue_url, last_error,
                 created_at, updated_at, published_at
          from feedback_requests where id = ?`,
    args: [input.id],
  });
  const row = selected.rows[0];
  if (!row) {
    return null;
  }
  return mapFeedbackRow(row as Record<string, unknown>);
}

/**
 * GitHub Issue create 直前に開始時刻を記録する（部分成功窓の reconcile 用）。
 * lease_owner / processing 一致時のみ成功。
 */
export async function markFeedbackGithubCreateStarted(input: {
  id: string;
  leaseOwner: string;
  now: Date;
}): Promise<boolean> {
  await ensureFeedbackSchema();
  const nowIso = input.now.toISOString();
  const update = await getTursoClient().execute({
    sql: `update feedback_requests
          set github_create_started_at = coalesce(github_create_started_at, ?),
              updated_at = ?
          where id = ?
            and status = 'processing'
            and lease_owner = ?`,
    args: [nowIso, nowIso, input.id, input.leaseOwner],
  });
  return (update.rowsAffected ?? 0) >= 1;
}

/**
 * published へ遷移。id + status=processing + lease_owner 一致が必須。
 * @returns rowsAffected >= 1 のとき true（stale worker は false）
 */
export async function markFeedbackPublished(input: {
  id: string;
  leaseOwner: string;
  githubIssueNumber: number;
  githubIssueUrl: string;
  now: Date;
}): Promise<boolean> {
  await ensureFeedbackSchema();
  const nowIso = input.now.toISOString();
  const update = await getTursoClient().execute({
    sql: `update feedback_requests
          set status = 'published',
              body = null,
              github_issue_number = ?,
              github_issue_url = ?,
              lease_owner = null,
              lease_expires_at = null,
              last_error = null,
              published_at = ?,
              updated_at = ?
          where id = ?
            and status = 'processing'
            and lease_owner = ?`,
    args: [
      input.githubIssueNumber,
      input.githubIssueUrl,
      nowIso,
      nowIso,
      input.id,
      input.leaseOwner,
    ],
  });
  return (update.rowsAffected ?? 0) >= 1;
}

/**
 * failed へ遷移。id + status=processing + lease_owner 一致が必須。
 * @returns rowsAffected >= 1 のとき true（stale worker は false）
 */
export async function markFeedbackFailed(input: {
  id: string;
  leaseOwner: string;
  errorCode: string;
  now: Date;
}): Promise<boolean> {
  await ensureFeedbackSchema();
  const nowIso = input.now.toISOString();
  // last_error は短いコードのみ。本文・URL・ヘッダは入れない。
  const safeCode = input.errorCode.slice(0, 80);
  const update = await getTursoClient().execute({
    sql: `update feedback_requests
          set status = 'failed',
              lease_owner = null,
              lease_expires_at = null,
              last_error = ?,
              updated_at = ?
          where id = ?
            and status = 'processing'
            and lease_owner = ?`,
    args: [safeCode, nowIso, input.id, input.leaseOwner],
  });
  return (update.rowsAffected ?? 0) >= 1;
}

/** テスト・内部用: create 開始時刻を直接設定する。 */
export async function setFeedbackGithubCreateStartedAtForTests(input: {
  id: string;
  githubCreateStartedAt: string;
}): Promise<void> {
  await ensureFeedbackSchema();
  await getTursoClient().execute({
    sql: `update feedback_requests
          set github_create_started_at = ?,
              updated_at = ?
          where id = ?`,
    args: [input.githubCreateStartedAt, input.githubCreateStartedAt, input.id],
  });
}

export function createGithubFeedbackClient(env: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}): GithubFeedbackClient {
  const fetchImpl = env.fetchImpl ?? fetch;
  const baseHeaders = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "anime-tier-board-feedback-cron",
  };

  return {
    async findIssueByFeedbackId(feedbackId) {
      const marker = buildFeedbackGithubMarker(feedbackId);
      const q = `repo:${env.owner}/${env.repo} "${marker}" in:body`;
      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=5`;
      const response = await fetchImpl(url, { headers: baseHeaders, method: "GET" });
      if (!response.ok) {
        throw new Error(`github_search_${response.status}`);
      }
      const payload = (await response.json()) as {
        items?: Array<{ number: number; html_url: string; body?: string | null }>;
      };
      const items = payload.items ?? [];
      const exact = items.find((item) => (item.body ?? "").includes(marker));
      if (!exact) {
        return null;
      }
      return { number: exact.number, htmlUrl: exact.html_url };
    },
    async createIssue({ title, body }) {
      const url = `https://api.github.com/repos/${env.owner}/${env.repo}/issues`;
      const headers = {
        ...baseHeaders,
        "Content-Type": "application/json",
      };
      // labels は任意。未作成ラベルで 422 になっても Issue 本体は labels なしで再試行する。
      const optionalLabels = ["user-feedback", "from-app"];
      const withLabels = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          body,
          labels: optionalLabels,
        }),
      });
      let response = withLabels;
      if (!withLabels.ok && withLabels.status === 422) {
        // ラベル依存で transaction 全体を落とさない
        response = await fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ title, body }),
        });
      }
      if (!response.ok) {
        throw new Error(`github_create_${response.status}`);
      }
      const payload = (await response.json()) as {
        number: number;
        html_url: string;
      };
      return { number: payload.number, htmlUrl: payload.html_url };
    },
  };
}

async function findIssueWithRetries(
  github: GithubFeedbackClient,
  feedbackId: string,
  searchCount: number
): Promise<GithubIssueRecord | null> {
  let last: GithubIssueRecord | null = null;
  for (let i = 0; i < searchCount; i += 1) {
    last = await github.findIssueByFeedbackId(feedbackId);
    if (last) {
      return last;
    }
  }
  return last;
}

function isWithinReconcileWindow(
  githubCreateStartedAt: string | null,
  now: Date,
  windowMs: number
): boolean {
  if (!githubCreateStartedAt) {
    return false;
  }
  const started = Date.parse(githubCreateStartedAt);
  if (!Number.isFinite(started)) {
    return false;
  }
  return now.getTime() - started < windowMs;
}

/**
 * claim 済み 1 件を GitHub Issue 化し、成功時は本文を NULL にする。
 * 既存 Issue（marker）があれば再作成せず published にする（冪等）。
 * create 成功〜DB 更新前の部分成功窓では再 create せず reconcile 検索のみ行う。
 */
export async function publishClaimedFeedbackToGithub(input: {
  row: FeedbackRequestRow;
  github: GithubFeedbackClient;
  now: Date;
  reconcileWindowMs?: number;
  reconcileSearchCount?: number;
}): Promise<{
  outcome: "published" | "failed" | "reconcile_wait";
  issueNumber?: number;
  createAttempted?: boolean;
  searchCount?: number;
}> {
  const { row, github, now } = input;
  const leaseOwner = row.leaseOwner;
  if (!leaseOwner) {
    return { outcome: "failed" };
  }

  const reconcileWindowMs = input.reconcileWindowMs ?? FEEDBACK_RECONCILE_WINDOW_MS;
  const reconcileSearchCount =
    input.reconcileSearchCount ?? FEEDBACK_RECONCILE_SEARCH_COUNT;
  const createAlreadyStarted = row.githubCreateStartedAt != null;
  const searchCount = createAlreadyStarted ? reconcileSearchCount : 1;

  try {
    const existing = await findIssueWithRetries(github, row.id, searchCount);
    if (existing) {
      const ok = await markFeedbackPublished({
        id: row.id,
        leaseOwner,
        githubIssueNumber: existing.number,
        githubIssueUrl: existing.htmlUrl,
        now,
      });
      if (!ok) {
        return { outcome: "failed", searchCount };
      }
      return {
        outcome: "published",
        issueNumber: existing.number,
        createAttempted: false,
        searchCount,
      };
    }

    // 部分成功窓: create 開始済みなら即 create せず、search で reconcile する
    if (
      createAlreadyStarted &&
      isWithinReconcileWindow(row.githubCreateStartedAt, now, reconcileWindowMs)
    ) {
      const ok = await markFeedbackFailed({
        id: row.id,
        leaseOwner,
        errorCode: "reconcile_pending",
        now,
      });
      if (!ok) {
        return { outcome: "failed", createAttempted: false, searchCount };
      }
      return {
        outcome: "reconcile_wait",
        createAttempted: false,
        searchCount,
      };
    }

    if (!row.body || row.body.length < FEEDBACK_BODY_MIN) {
      await markFeedbackFailed({
        id: row.id,
        leaseOwner,
        errorCode: "missing_body",
        now,
      });
      return { outcome: "failed", createAttempted: false, searchCount };
    }

    const started = await markFeedbackGithubCreateStarted({
      id: row.id,
      leaseOwner,
      now,
    });
    if (!started) {
      return { outcome: "failed", createAttempted: false, searchCount };
    }

    // create 直前に最終 search（開始マーク後の競合・遅延反映対策）
    const existingAfterMark = await github.findIssueByFeedbackId(row.id);
    if (existingAfterMark) {
      const ok = await markFeedbackPublished({
        id: row.id,
        leaseOwner,
        githubIssueNumber: existingAfterMark.number,
        githubIssueUrl: existingAfterMark.htmlUrl,
        now,
      });
      if (!ok) {
        return { outcome: "failed", createAttempted: false, searchCount: searchCount + 1 };
      }
      return {
        outcome: "published",
        issueNumber: existingAfterMark.number,
        createAttempted: false,
        searchCount: searchCount + 1,
      };
    }

    const title = buildFeedbackGithubIssueTitle(row.level, row.id);
    const body = buildFeedbackGithubIssueBody({
      id: row.id,
      level: row.level,
      body: row.body,
      imageBlobUrl: row.imageBlobUrl,
    });
    const created = await github.createIssue({ title, body });
    const ok = await markFeedbackPublished({
      id: row.id,
      leaseOwner,
      githubIssueNumber: created.number,
      githubIssueUrl: created.htmlUrl,
      now,
    });
    if (!ok) {
      // GitHub 側は成功済み。DB は次の re-claim で reconcile 検索する。
      return {
        outcome: "failed",
        issueNumber: created.number,
        createAttempted: true,
        searchCount: searchCount + 1,
      };
    }
    return {
      outcome: "published",
      issueNumber: created.number,
      createAttempted: true,
      searchCount: searchCount + 1,
    };
  } catch {
    await markFeedbackFailed({
      id: row.id,
      leaseOwner,
      errorCode: "publish_failed",
      now,
    });
    return { outcome: "failed", createAttempted: false, searchCount };
  }
}

export type FeedbackCronResult = {
  claimed: number;
  published: number;
  failed: number;
  skipped: number;
  reconcileWait: number;
};

export async function runFeedbackToIssuesCron(input: {
  github: GithubFeedbackClient;
  now?: Date;
  leaseOwner?: string;
  limit?: number;
}): Promise<FeedbackCronResult> {
  const now = input.now ?? new Date();
  const leaseOwner = input.leaseOwner ?? randomUUID();
  const limit = input.limit ?? FEEDBACK_CRON_BATCH_LIMIT;

  const candidates = await listClaimableFeedbackIds(limit, now);
  let claimed = 0;
  let published = 0;
  let failed = 0;
  let skipped = 0;
  let reconcileWait = 0;

  for (const id of candidates) {
    const row = await tryClaimFeedbackRequest({
      id,
      leaseOwner,
      now,
    });
    if (!row) {
      skipped += 1;
      continue;
    }
    claimed += 1;
    const result = await publishClaimedFeedbackToGithub({
      row,
      github: input.github,
      now,
    });
    if (result.outcome === "published") {
      published += 1;
    } else if (result.outcome === "reconcile_wait") {
      reconcileWait += 1;
      failed += 1;
    } else {
      failed += 1;
    }
  }

  return { claimed, published, failed, skipped, reconcileWait };
}

/** ソース契約検査用: CREATE TABLE 定義に個人識別列がないことを確認する文字列。 */
export const FEEDBACK_SCHEMA_SQL_SNIPPET = `
create table if not exists feedback_requests (
  id text primary key not null,
  level text not null,
  body text,
  image_blob_url text,
  image_blob_pathname text,
  status text not null,
  attempt_count integer not null default 0,
  lease_owner text,
  lease_expires_at text,
  github_create_started_at text,
  github_issue_number integer,
  github_issue_url text,
  last_error text,
  created_at text not null,
  updated_at text not null,
  published_at text
)
`;

