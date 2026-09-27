import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCommentsDeleteHandler,
  type CommentsDeleteDependencies,
} from "../app/api/shares/[shareId]/comments/route.ts";
import {
  createReportPostHandler,
  type ReportPostDependencies,
} from "../app/api/shares/[shareId]/comments/[commentId]/report/route.ts";
import {
  COMMENT_NOT_FOUND,
  COMMENT_OPERATION_FAILED,
  WRITE_ORIGIN_FORBIDDEN,
} from "../lib/api/write-request-guard.ts";

const BASE_URL = "https://anime-tier-board.test";
const ORIGIN = BASE_URL;

function makeRequest(
  path: string,
  init: RequestInit & { origin?: string } = {}
): Request {
  const headers = new Headers(init.headers);
  headers.set("origin", init.origin ?? ORIGIN);
  if (init.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const { origin: _origin, ...requestInit } = init;
  return new Request(`${BASE_URL}${path}`, { ...requestInit, headers });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function reportHandler(overrides: Partial<ReportPostDependencies> = {}) {
  return createReportPostHandler({
    consumeRateLimit: () => null,
    ...overrides,
  });
}

function deleteHandler(overrides: Partial<CommentsDeleteDependencies> = {}) {
  return createCommentsDeleteHandler({
    consumeRateLimit: () => null,
    ...overrides,
  });
}

test("report POST returns 401 for unauthenticated callers", async () => {
  const handler = reportHandler({ getSession: async () => null });
  const response = await handler(
    makeRequest("/api/shares/share-a/comments/comment-a/report", {
      method: "POST",
      body: JSON.stringify({ reason: "spam" }),
    }),
    { params: Promise.resolve({ shareId: "share-a", commentId: "comment-a" }) }
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await readJson(response), { error: "認証が必要です。" });
});

test("report POST denies cross-origin requests before reading the body", async () => {
  let readCount = 0;
  const handler = reportHandler({
    getSession: async () => ({ user: { id: "reporter-a" } }),
    readJson: async () => {
      readCount += 1;
      return { ok: true, data: { reason: "spam" } };
    },
  });
  const response = await handler(
    makeRequest("/api/shares/share-a/comments/comment-a/report", {
      method: "POST",
      origin: "https://evil.example",
      body: JSON.stringify({ reason: "spam" }),
    }),
    { params: Promise.resolve({ shareId: "share-a", commentId: "comment-a" }) }
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await readJson(response), { error: WRITE_ORIGIN_FORBIDDEN });
  assert.equal(readCount, 0);
});

test("report POST returns safe 404 for malformed IDs and 400 for malformed bodies", async () => {
  let reportCount = 0;
  const handler = reportHandler({
    getSession: async () => ({ user: { id: "reporter-a" } }),
    reportComment: async () => {
      reportCount += 1;
      return { outcome: "reported", hidden: false };
    },
  });

  const malformedId = await handler(
    makeRequest("/api/shares/share-a/comments/comment-a/report", {
      method: "POST",
      body: JSON.stringify({ reason: "spam" }),
    }),
    { params: Promise.resolve({ shareId: "bad/id", commentId: "comment-a" }) }
  );
  assert.equal(malformedId.status, 404);
  assert.deepEqual(await readJson(malformedId), { error: COMMENT_NOT_FOUND });

  const malformedBody = await handler(
    makeRequest("/api/shares/share-a/comments/comment-a/report", {
      method: "POST",
      body: JSON.stringify({ reason: "unknown" }),
    }),
    { params: Promise.resolve({ shareId: "share-a", commentId: "comment-a" }) }
  );
  assert.equal(malformedBody.status, 400);
  assert.equal(typeof (await readJson(malformedBody)).error, "string");
  assert.equal(reportCount, 0);
});

test("report POST maps duplicate, self, missing, and database failure outcomes", async () => {
  const outcomes = [
    {
      result: { outcome: "duplicate", hidden: true } as const,
      status: 200,
      expected: { ok: true, duplicate: true, hidden: true },
    },
    {
      result: { outcome: "self" } as const,
      status: 403,
      expectedJapanese: true,
    },
    {
      result: { outcome: "not_found" } as const,
      status: 404,
      expected: { error: COMMENT_NOT_FOUND },
    },
  ];

  for (const outcome of outcomes) {
    const handler = reportHandler({
      getSession: async () => ({ user: { id: "reporter-a" } }),
      reportComment: async () => outcome.result,
    });
    const response = await handler(
      makeRequest("/api/shares/share-a/comments/comment-a/report", {
        method: "POST",
        body: JSON.stringify({ reason: "spam" }),
      }),
      { params: Promise.resolve({ shareId: "share-a", commentId: "comment-a" }) }
    );
    assert.equal(response.status, outcome.status);
    const body = await readJson(response);
    if (outcome.expected) assert.deepEqual(body, outcome.expected);
    if (outcome.expectedJapanese) {
      assert.equal(typeof body.error, "string");
      assert.match(body.error as string, /[ぁ-んァ-ン一-龯]/u);
    }
  }

  const failureHandler = reportHandler({
    getSession: async () => ({ user: { id: "reporter-a" } }),
    reportComment: async () => {
      throw new Error("database credentials leaked would be bad");
    },
  });
  const failure = await failureHandler(
    makeRequest("/api/shares/share-a/comments/comment-a/report", {
      method: "POST",
      body: JSON.stringify({ reason: "spam" }),
    }),
    { params: Promise.resolve({ shareId: "share-a", commentId: "comment-a" }) }
  );
  assert.equal(failure.status, 500);
  assert.deepEqual(await readJson(failure), { error: COMMENT_OPERATION_FAILED });
});

test("comments DELETE covers authentication, origin, malformed IDs, and safe enumeration", async () => {
  const unauthenticated = deleteHandler({ getSession: async () => null });
  const unauthenticatedResponse = await unauthenticated(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a", { method: "DELETE" }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  assert.equal(unauthenticatedResponse.status, 401);

  const unauthenticatedHide = await unauthenticated(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a&action=hide", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  assert.equal(unauthenticatedHide.status, 404);
  assert.deepEqual(await readJson(unauthenticatedHide), { error: COMMENT_NOT_FOUND });

  const originDenied = deleteHandler({
    getSession: async () => ({ user: { id: "owner-a" } }),
  });
  const originResponse = await originDenied(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a", {
      method: "DELETE",
      origin: "https://evil.example",
    }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  assert.equal(originResponse.status, 403);

  let moderationCount = 0;
  const malformed = deleteHandler({
    getSession: async () => ({ user: { id: "owner-a" } }),
    moderateComment: async () => {
      moderationCount += 1;
      return { outcome: "moderated" };
    },
  });
  const malformedResponse = await malformed(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a", { method: "DELETE" }),
    { params: Promise.resolve({ shareId: "bad/id" }) }
  );
  assert.equal(malformedResponse.status, 400);
  assert.equal(moderationCount, 0);

  const notFound = deleteHandler({
    getSession: async () => ({ user: { id: "other-user" } }),
    moderateComment: async () => ({ outcome: "not_found" }),
  });
  const notFoundResponse = await notFound(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a", { method: "DELETE" }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  assert.equal(notFoundResponse.status, 404);
  assert.deepEqual(await readJson(notFoundResponse), { error: COMMENT_NOT_FOUND });

  const nonOwner = deleteHandler({
    getSession: async () => ({ user: { id: "other-user" } }),
    moderateComment: async () => ({ outcome: "forbidden" }),
  });
  const nonOwnerResponse = await nonOwner(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a", { method: "DELETE" }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  assert.equal(nonOwnerResponse.status, 404);
  assert.deepEqual(await readJson(nonOwnerResponse), { error: COMMENT_NOT_FOUND });
});

test("comments DELETE lets owners hide/delete, preserves generic DB failures, and hides action details", async () => {
  const calls: Array<{ actorUserId: string; action: string }> = [];
  const owner = deleteHandler({
    getSession: async () => ({ user: { id: "owner-a" } }),
    moderateComment: async (input) => {
      calls.push({ actorUserId: input.actorUserId, action: input.action });
      return { outcome: "moderated" };
    },
  });

  const hideResponse = await owner(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a&action=hide", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  const deleteResponse = await owner(
    makeRequest("/api/shares/share-a/comments?commentId=comment-b&action=delete", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  assert.equal(hideResponse.status, 200);
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(calls, [
    { actorUserId: "owner-a", action: "hide" },
    { actorUserId: "owner-a", action: "delete" },
  ]);

  const invalidAction = await owner(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a&action=purge", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  assert.equal(invalidAction.status, 400);

  const failure = deleteHandler({
    getSession: async () => ({ user: { id: "owner-a" } }),
    moderateComment: async () => {
      throw new Error("private database detail");
    },
  });
  const failureResponse = await failure(
    makeRequest("/api/shares/share-a/comments?commentId=comment-a", { method: "DELETE" }),
    { params: Promise.resolve({ shareId: "share-a" }) }
  );
  assert.equal(failureResponse.status, 500);
  assert.deepEqual(await readJson(failureResponse), { error: COMMENT_OPERATION_FAILED });
});
