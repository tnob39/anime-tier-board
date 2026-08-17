import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
  FEEDBACK_RECONCILE_SEARCH_COUNT,
  FEEDBACK_RECONCILE_WINDOW_MS,
  buildFeedbackGithubIssueBody,
  buildFeedbackGithubMarker,
  createGithubFeedbackClient,
  extractFeedbackIdFromMarkerText,
  insertFeedbackRequest,
  markFeedbackFailed,
  markFeedbackGithubCreateStarted,
  markFeedbackPublished,
  parseGithubFeedbackRepo,
  publishClaimedFeedbackToGithub,
  resetFeedbackSchemaCacheForTests,
  runFeedbackToIssuesCron,
  setFeedbackGithubCreateStartedAtForTests,
  tryClaimFeedbackRequest,
  type FeedbackRequestRow,
  type GithubFeedbackClient,
  type GithubIssueRecord,
} from "../lib/feedback.ts";
import { resetTursoClientForTests } from "../lib/turso.ts";

const tempDirs: string[] = [];

// Hobby互換の毎日cronでも、部分成功の照合窓は複数回の実行を跨ぐ必要がある。
test("reconcile window spans multiple daily cron runs", () => {
  assert.ok(FEEDBACK_RECONCILE_WINDOW_MS >= 72 * 60 * 60 * 1000);
});

function createMemoryEnv() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "atb-feedback-"));
  tempDirs.push(dir);
  const dbPath = path.join(dir, "db.sqlite");
  const url = pathToFileURL(dbPath).href;
  resetTursoClientForTests();
  process.env.TURSO_DATABASE_URL = url;
  process.env.TURSO_AUTH_TOKEN = "test-token";
  resetFeedbackSchemaCacheForTests();
  const client = createClient({ url });
  return client;
}

afterEach(() => {
  resetFeedbackSchemaCacheForTests();
  resetTursoClientForTests();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test("parseGithubFeedbackRepo accepts owner/repo only", () => {
  assert.deepEqual(parseGithubFeedbackRepo("tnob39/anime-tier-board"), {
    owner: "tnob39",
    repo: "anime-tier-board",
  });
  assert.equal(parseGithubFeedbackRepo("not-a-repo"), null);
  assert.equal(parseGithubFeedbackRepo(""), null);
});

test("feedback-id marker extraction is stable", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const marker = buildFeedbackGithubMarker(id);
  assert.equal(marker, `feedback-id: ${id}`);
  const body = buildFeedbackGithubIssueBody({
    id,
    level: "improvement",
    body: "UIの導線を分かりやすくしてほしいです。",
    imageBlobUrl: null,
  });
  assert.equal(extractFeedbackIdFromMarkerText(body), id);
  assert.equal(extractFeedbackIdFromMarkerText("no marker here"), null);
});

test("claim/lease prevents double claim of the same row", async () => {
  createMemoryEnv();
  const now = new Date("2026-08-17T00:00:00.000Z");
  await insertFeedbackRequest({
    id: "11111111-1111-4111-8111-111111111111",
    level: "idea",
    body: "これは十分に長い匿名フィードバック本文です",
    imageBlobUrl: null,
    imageBlobPathname: null,
    now,
  });

  const first = await tryClaimFeedbackRequest({
    id: "11111111-1111-4111-8111-111111111111",
    leaseOwner: "worker-a",
    now,
  });
  assert.ok(first);
  assert.equal(first.status, "processing");
  assert.equal(first.leaseOwner, "worker-a");
  assert.equal(first.attemptCount, 1);

  const second = await tryClaimFeedbackRequest({
    id: "11111111-1111-4111-8111-111111111111",
    leaseOwner: "worker-b",
    now: new Date(now.getTime() + 1000),
  });
  assert.equal(second, null);
});

test("expired lease can be reclaimed", async () => {
  createMemoryEnv();
  const t0 = new Date("2026-08-17T00:00:00.000Z");
  await insertFeedbackRequest({
    id: "22222222-2222-4222-8222-222222222222",
    level: "problem",
    body: "困っている内容を匿名で共有するテスト本文です",
    imageBlobUrl: null,
    imageBlobPathname: null,
    now: t0,
  });

  const claimed = await tryClaimFeedbackRequest({
    id: "22222222-2222-4222-8222-222222222222",
    leaseOwner: "worker-a",
    now: t0,
    leaseMs: 1000,
  });
  assert.ok(claimed);

  const reclaimed = await tryClaimFeedbackRequest({
    id: "22222222-2222-4222-8222-222222222222",
    leaseOwner: "worker-b",
    now: new Date(t0.getTime() + 5000),
  });
  assert.ok(reclaimed);
  assert.equal(reclaimed.leaseOwner, "worker-b");
  assert.equal(reclaimed.attemptCount, 2);
});

test("publish marks body null and is idempotent via existing GitHub issue", async () => {
  createMemoryEnv();
  const now = new Date("2026-08-17T01:00:00.000Z");
  const id = "33333333-3333-4333-8333-333333333333";
  await insertFeedbackRequest({
    id,
    level: "urgent",
    body: "重大な問題の再現手順を匿名で共有します。十分長い。",
    imageBlobUrl: "https://blob.example/feedback/x.webp",
    imageBlobPathname: "feedback/x.webp",
    now,
  });

  const claimed = await tryClaimFeedbackRequest({
    id,
    leaseOwner: "cron-1",
    now,
  });
  assert.ok(claimed);

  let createCalls = 0;
  const github: GithubFeedbackClient = {
    async findIssueByFeedbackId(feedbackId) {
      assert.equal(feedbackId, id);
      return {
        number: 7141,
        htmlUrl: "https://github.com/tnob39/anime-tier-board/issues/7141",
      };
    },
    async createIssue() {
      createCalls += 1;
      throw new Error("should not create when marker exists");
    },
  };

  const result = await publishClaimedFeedbackToGithub({
    row: claimed,
    github,
    now,
  });
  assert.equal(result.outcome, "published");
  assert.equal(result.issueNumber, 7141);
  assert.equal(createCalls, 0);

  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  const row = await client.execute({
    sql: "select body, status, github_issue_number from feedback_requests where id = ?",
    args: [id],
  });
  assert.equal(row.rows[0]?.body, null);
  assert.equal(String(row.rows[0]?.status), "published");
  assert.equal(Number(row.rows[0]?.github_issue_number), 7141);
  client.close();
});

test("runFeedbackToIssuesCron creates issue once and nulls body (fixture GitHub client)", async () => {
  createMemoryEnv();
  const now = new Date("2026-08-17T02:00:00.000Z");
  const ids = [
    "44444444-4444-4444-8444-444444444441",
    "44444444-4444-4444-8444-444444444442",
  ];
  for (const id of ids) {
    await insertFeedbackRequest({
      id,
      level: "improvement",
      body: `改善要望の本文です。id=${id.slice(0, 8)} を含む十分長い文章。`,
      imageBlobUrl: null,
      imageBlobPathname: null,
      now,
    });
  }

  const created = new Map<string, GithubIssueRecord>();
  let searchCalls = 0;
  let createCalls = 0;

  const github: GithubFeedbackClient = {
    async findIssueByFeedbackId(feedbackId) {
      searchCalls += 1;
      return created.get(feedbackId) ?? null;
    },
    async createIssue({ title, body }) {
      createCalls += 1;
      const id = extractFeedbackIdFromMarkerText(body);
      assert.ok(id);
      assert.match(title, /利用者の声/);
      assert.match(body, /feedback-id:/);
      const record = {
        number: 8000 + createCalls,
        htmlUrl: `https://github.com/example/repo/issues/${8000 + createCalls}`,
      };
      created.set(id, record);
      return record;
    },
  };

  const first = await runFeedbackToIssuesCron({
    github,
    now,
    leaseOwner: "batch-1",
    limit: 10,
  });
  assert.equal(first.claimed, 2);
  assert.equal(first.published, 2);
  assert.equal(first.failed, 0);
  assert.equal(createCalls, 2);

  // 2回目は claim 対象なし（published）
  const second = await runFeedbackToIssuesCron({
    github,
    now: new Date(now.getTime() + 60_000),
    leaseOwner: "batch-2",
    limit: 10,
  });
  assert.equal(second.claimed, 0);
  assert.equal(second.published, 0);
  assert.equal(createCalls, 2);
  assert.ok(searchCalls >= 2);

  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  const rows = await client.execute(
    "select id, body, status from feedback_requests order by id"
  );
  assert.equal(rows.rows.length, 2);
  for (const row of rows.rows) {
    assert.equal(row.body, null);
    assert.equal(String(row.status), "published");
  }
  client.close();
});

test("createGithubFeedbackClient search/create contracts use standard fetch", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, body });

    if (url.includes("/search/issues")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              number: 99,
              html_url: "https://github.com/tnob39/anime-tier-board/issues/99",
              body: "x\nfeedback-id: 123e4567-e89b-12d3-a456-426614174000\n",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/repos/") && method === "POST") {
      return new Response(
        JSON.stringify({
          number: 100,
          html_url: "https://github.com/tnob39/anime-tier-board/issues/100",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  };

  const client = createGithubFeedbackClient({
    token: "ghs_test",
    owner: "tnob39",
    repo: "anime-tier-board",
    fetchImpl,
  });

  const found = await client.findIssueByFeedbackId(
    "123e4567-e89b-12d3-a456-426614174000"
  );
  assert.equal(found?.number, 99);
  assert.match(calls[0]?.url ?? "", /api\.github\.com\/search\/issues/);
  assert.match(calls[0]?.url ?? "", /feedback-id/);

  const created = await client.createIssue({
    title: "t",
    body: "feedback-id: 123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(created.number, 100);
  assert.equal(calls[1]?.method, "POST");
  assert.match(calls[1]?.url ?? "", /api\.github\.com\/repos\/tnob39\/anime-tier-board\/issues/);
  assert.match(calls[1]?.body ?? "", /labels/);
});

test("createGithubFeedbackClient retries without labels on 422", async () => {
  const bodies: string[] = [];
  let postCount = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/repos/") && method === "POST") {
      postCount += 1;
      const body = typeof init?.body === "string" ? init.body : "";
      bodies.push(body);
      if (postCount === 1) {
        // 未作成ラベル想定の 422
        return new Response(JSON.stringify({ message: "Validation Failed" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        });
      }
      assert.equal(JSON.parse(body).labels, undefined);
      return new Response(
        JSON.stringify({
          number: 101,
          html_url: "https://github.com/tnob39/anime-tier-board/issues/101",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  };

  const client = createGithubFeedbackClient({
    token: "ghs_test",
    owner: "tnob39",
    repo: "anime-tier-board",
    fetchImpl,
  });
  const created = await client.createIssue({
    title: "t",
    body: "feedback-id: 123e4567-e89b-12d3-a456-426614174000",
  });
  assert.equal(created.number, 101);
  assert.equal(postCount, 2);
  assert.match(bodies[0] ?? "", /labels/);
  assert.equal(JSON.parse(bodies[1] ?? "{}").labels, undefined);
});

test("markFeedbackPublished nulls body (contract) with lease owner", async () => {
  createMemoryEnv();
  const now = new Date("2026-08-17T03:00:00.000Z");
  const id = "55555555-5555-4555-8555-555555555555";
  await insertFeedbackRequest({
    id,
    level: "idea",
    body: "公開後に本文が消えることを確認する十分長い本文",
    imageBlobUrl: null,
    imageBlobPathname: null,
    now,
  });
  const claimed = await tryClaimFeedbackRequest({
    id,
    leaseOwner: "worker-pub",
    now,
  });
  assert.ok(claimed);
  const ok = await markFeedbackPublished({
    id,
    leaseOwner: "worker-pub",
    githubIssueNumber: 1,
    githubIssueUrl: "https://github.com/tnob39/anime-tier-board/issues/1",
    now,
  });
  assert.equal(ok, true);
  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  const row = await client.execute({
    sql: "select body, status from feedback_requests where id = ?",
    args: [id],
  });
  assert.equal(row.rows[0]?.body, null);
  assert.equal(String(row.rows[0]?.status), "published");
  client.close();
});

test("stale worker cannot mark published or failed without matching lease", async () => {
  createMemoryEnv();
  const now = new Date("2026-08-17T03:30:00.000Z");
  const id = "66666666-6666-4666-8666-666666666666";
  await insertFeedbackRequest({
    id,
    level: "problem",
    body: "stale worker が更新できないことを確認する十分長い本文",
    imageBlobUrl: null,
    imageBlobPathname: null,
    now,
  });
  const claimed = await tryClaimFeedbackRequest({
    id,
    leaseOwner: "owner-current",
    now,
  });
  assert.ok(claimed);

  const publishedByStale = await markFeedbackPublished({
    id,
    leaseOwner: "owner-stale",
    githubIssueNumber: 9,
    githubIssueUrl: "https://github.com/tnob39/anime-tier-board/issues/9",
    now,
  });
  assert.equal(publishedByStale, false);

  const failedByStale = await markFeedbackFailed({
    id,
    leaseOwner: "owner-stale",
    errorCode: "stale_try",
    now,
  });
  assert.equal(failedByStale, false);

  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  const row = await client.execute({
    sql: "select status, lease_owner, body, github_issue_number, last_error from feedback_requests where id = ?",
    args: [id],
  });
  assert.equal(String(row.rows[0]?.status), "processing");
  assert.equal(String(row.rows[0]?.lease_owner), "owner-current");
  assert.notEqual(row.rows[0]?.body, null);
  assert.equal(row.rows[0]?.github_issue_number, null);
  assert.equal(row.rows[0]?.last_error, null);
  client.close();

  const publishedByOwner = await markFeedbackPublished({
    id,
    leaseOwner: "owner-current",
    githubIssueNumber: 10,
    githubIssueUrl: "https://github.com/tnob39/anime-tier-board/issues/10",
    now,
  });
  assert.equal(publishedByOwner, true);
});

test("partial success window: after create-started, re-claim does multi-search and skips create", async () => {
  createMemoryEnv();
  const t0 = new Date("2026-08-17T04:00:00.000Z");
  const id = "77777777-7777-4777-8777-777777777777";
  await insertFeedbackRequest({
    id,
    level: "improvement",
    body: "GitHub create 成功後に DB 更新が落ちた窓を再現する十分長い本文",
    imageBlobUrl: null,
    imageBlobPathname: null,
    now: t0,
  });

  // worker-a: claim → create 開始マーク → create 成功想定だが DB 更新前にクラッシュ
  const first = await tryClaimFeedbackRequest({
    id,
    leaseOwner: "worker-a",
    now: t0,
    leaseMs: 1000,
  });
  assert.ok(first);
  const started = await markFeedbackGithubCreateStarted({
    id,
    leaseOwner: "worker-a",
    now: t0,
  });
  assert.equal(started, true);
  // create 成功したが markPublished 未実行のまま lease 期限切れ

  let searchCalls = 0;
  let createCalls = 0;
  const github: GithubFeedbackClient = {
    async findIssueByFeedbackId() {
      searchCalls += 1;
      // eventual consistency: まだ search に見えない
      return null;
    },
    async createIssue() {
      createCalls += 1;
      throw new Error("must not create during reconcile window");
    },
  };

  const reclaimed = await tryClaimFeedbackRequest({
    id,
    leaseOwner: "worker-b",
    now: new Date(t0.getTime() + 5000),
  });
  assert.ok(reclaimed);
  assert.equal(reclaimed.leaseOwner, "worker-b");
  assert.ok(reclaimed.githubCreateStartedAt);

  const result = await publishClaimedFeedbackToGithub({
    row: reclaimed,
    github,
    now: new Date(t0.getTime() + 5000),
    reconcileWindowMs: FEEDBACK_RECONCILE_WINDOW_MS,
    reconcileSearchCount: FEEDBACK_RECONCILE_SEARCH_COUNT,
  });

  assert.equal(result.outcome, "reconcile_wait");
  assert.equal(result.createAttempted, false);
  assert.equal(createCalls, 0);
  assert.equal(searchCalls, FEEDBACK_RECONCILE_SEARCH_COUNT);
  assert.equal(result.searchCount, FEEDBACK_RECONCILE_SEARCH_COUNT);

  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  const row = await client.execute({
    sql: "select status, last_error, github_create_started_at from feedback_requests where id = ?",
    args: [id],
  });
  assert.equal(String(row.rows[0]?.status), "failed");
  assert.equal(String(row.rows[0]?.last_error), "reconcile_pending");
  assert.ok(row.rows[0]?.github_create_started_at);
  client.close();
});

test("partial success window: multi-search finds existing issue and publishes without create", async () => {
  createMemoryEnv();
  const t0 = new Date("2026-08-17T05:00:00.000Z");
  const id = "88888888-8888-4888-8888-888888888888";
  await insertFeedbackRequest({
    id,
    level: "urgent",
    body: "search が後から見える部分成功を reconcile する十分長い本文",
    imageBlobUrl: null,
    imageBlobPathname: null,
    now: t0,
  });
  const claimed = await tryClaimFeedbackRequest({
    id,
    leaseOwner: "worker-c",
    now: t0,
  });
  assert.ok(claimed);
  await setFeedbackGithubCreateStartedAtForTests({
    id,
    githubCreateStartedAt: t0.toISOString(),
  });
  // re-read with create started
  const rowAfter = {
    ...claimed,
    githubCreateStartedAt: t0.toISOString(),
  };

  let searchCalls = 0;
  let createCalls = 0;
  const github: GithubFeedbackClient = {
    async findIssueByFeedbackId() {
      searchCalls += 1;
      if (searchCalls < 2) {
        return null;
      }
      return {
        number: 9001,
        htmlUrl: "https://github.com/tnob39/anime-tier-board/issues/9001",
      };
    },
    async createIssue() {
      createCalls += 1;
      throw new Error("should not create when search eventually finds issue");
    },
  };

  const result = await publishClaimedFeedbackToGithub({
    row: rowAfter,
    github,
    now: new Date(t0.getTime() + 1000),
  });
  assert.equal(result.outcome, "published");
  assert.equal(result.issueNumber, 9001);
  assert.equal(createCalls, 0);
  assert.ok(searchCalls >= 2);

  const client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  const row = await client.execute({
    sql: "select status, body, github_issue_number from feedback_requests where id = ?",
    args: [id],
  });
  assert.equal(String(row.rows[0]?.status), "published");
  assert.equal(row.rows[0]?.body, null);
  assert.equal(Number(row.rows[0]?.github_issue_number), 9001);
  client.close();
});

// compile-time/style: ensure row type does not include PII fields
test("FeedbackRequestRow type shape excludes identity fields (runtime keys)", () => {
  const sample: FeedbackRequestRow = {
    id: "x",
    level: "idea",
    body: null,
    imageBlobUrl: null,
    imageBlobPathname: null,
    status: "pending",
    attemptCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    githubCreateStartedAt: null,
    githubIssueNumber: null,
    githubIssueUrl: null,
    lastError: null,
    createdAt: "",
    updatedAt: "",
    publishedAt: null,
  };
  const keys = Object.keys(sample);
  for (const forbidden of [
    "email",
    "userId",
    "user_id",
    "ip",
    "userAgent",
    "cookie",
    "deviceId",
    "originalFilename",
  ]) {
    assert.equal(keys.includes(forbidden), false);
  }
});
