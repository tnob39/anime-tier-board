import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, test } from "node:test";
import { createClient } from "@libsql/client";
import { ensureShareSchema, listOwnerCommentInbox, moderateComment, reportComment } from "../lib/shares.ts";
import { createOwnerCommentInboxHandler } from "../lib/api/owner-comment-inbox-handlers.ts";
import { AppError } from "../lib/errors/app-error.ts";
import {
  OWNER_COMMENT_INBOX_PAGE_SIZE, OWNER_COMMENT_PREVIEW_LENGTH,
  parseOwnerCommentInboxCursor, ownerCommentShareHref, ownerCommentPreview
} from "../lib/owner-comment-inbox.ts";

let client: ReturnType<typeof createClient>;
let directory: string;
const at = "2026-10-03T01:00:00.000Z";
const later = "2026-10-03T02:00:00.000Z";

beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "atb-owner-inbox-"));
  client = createClient({ url: pathToFileURL(path.join(directory, "test.db")).href });
  await client.execute("pragma foreign_keys = on");
  await ensureShareSchema(client);
});
afterEach(() => {
  client.close();
  assert.ok(directory.startsWith(path.join(os.tmpdir(), "atb-owner-inbox-")));
  try { rmSync(directory, { recursive: true, force: true }); }
  catch (error) {
    if (!["EPERM", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
});

async function share(id: string, owner: string | null = "owner-a", board = "{}") {
  await client.execute({ sql: `insert into board_shares
    (share_id, user_id, board_json, items_json, created_at, updated_at) values (?, ?, ?, '[]', ?, ?)`,
    args: [id, owner, board, at, at] });
}
async function comment(id: string, shareId: string, body = "コメント", createdAt = at, hiddenAt: string | null = null) {
  await client.execute({ sql: `insert into share_comments
    (comment_id, share_id, user_id, user_name, user_image, body, created_at, updated_at, hidden_at)
    values (?, ?, 'comment-author-private', 'private-name', 'private-image', ?, ?, ?, ?)`,
    args: [id, shareId, body, createdAt, createdAt, hiddenAt] });
}
function handler(owner = "owner-a") {
  return createOwnerCommentInboxHandler({
    requireUserId: async () => owner,
    list: (userId, cursor) => listOwnerCommentInbox(userId, cursor, client)
  });
}
function request(query = "", headers: HeadersInit = {}) {
  return new Request(`https://inbox.test/api/dashboard/comments${query}`, { headers });
}

test("repository and API isolate owners, allow only supported kinds, and expose only the inbox DTO", async () => {
  for (const [id, owner, board] of [
    ["tier-a", "owner-a", "{}"], ["analysis-a", "owner-a", '{"kind":"dashboard","title":"private-title"}'],
    ["watchlist-a", "owner-a", '{"kind":"watchlist"}'], ["tier-b", "owner-b", "{}"],
    ["impressions-a", "owner-a", '{"kind":"season-impressions"}'], ["unknown-a", "owner-a", '{"kind":"future"}'],
    ["malformed-a", "owner-a", "not-json"], ["array-a", "owner-a", "[]"]
  ]) {
    await share(id, owner, board);
    await comment(`comment-${id}`, id);
  }
  await share("unowned", null); await comment("unowned-comment", "unowned");
  await share("empty-a");
  await comment("orphan-comment", "missing-share");
  const response = await handler()(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie, Authorization");
  const result = await response.json();
  assert.deepEqual(result.items.map((item: { shareId: string }) => item.shareId), ["watchlist-a", "tier-a", "analysis-a"]);
  for (const item of result.items) {
    assert.deepEqual(Object.keys(item).sort(), ["shareId", "kind", "sharedAt", "commentCount", "latestCommentAt", "preview"].sort());
  }
  assert.doesNotMatch(JSON.stringify(result), /private|owner-|comment-author|reporter|email|userId|user_id|ip_address|season-impressions/);
  assert.equal(result.nextCursor, null);
  assert.deepEqual((await listOwnerCommentInbox("owner-b", null, client)).items.map((item) => item.shareId), ["tier-b"]);
  assert.deepEqual(await listOwnerCommentInbox("' OR 1=1 --", null, client), { items: [], nextCursor: null });
});

test("counts include all visible comments beyond the public thread limit; latest timestamp and tie-broken preview agree", async () => {
  await share("many");
  await client.batch(Array.from({ length: 105 }, (_, index) => ({
    sql: `insert into share_comments (comment_id, share_id, user_id, body, created_at, updated_at)
      values (?, 'many', 'author', 'older', ?, ?)`, args: [`old-${index}`, at, at]
  })), "write");
  await comment("latest-a", "many", "同時刻の前のコメント", later);
  const body = "😀".repeat(150) + "not-returned";
  await comment("latest-z", "many", body, later);
  await comment("hidden-newest", "many", "hidden", "2026-10-03T03:00:00.000Z", at);
  const { items } = await listOwnerCommentInbox("owner-a", null, client);
  assert.deepEqual(items, [{ shareId: "many", kind: "tier", sharedAt: at, commentCount: 107,
    latestCommentAt: later, preview: "😀".repeat(119) + "…" }]);
  assert.equal(Array.from(items[0].preview).length, OWNER_COMMENT_PREVIEW_LENGTH);
});

test("owner hide, author/owner delete and the third report immediately update counts, latest preview and empty state", async () => {
  await share("moderated");
  await comment("old", "moderated", "古いコメント");
  await comment("new", "moderated", "新しいコメント", later);
  assert.equal((await listOwnerCommentInbox("owner-a", null, client)).items[0].commentCount, 2);
  assert.deepEqual(await moderateComment({ shareId: "moderated", commentId: "new", actorUserId: "owner-a", action: "hide", client }), { outcome: "moderated" });
  const remaining = (await listOwnerCommentInbox("owner-a", null, client)).items[0];
  assert.equal(remaining.commentCount, 1); assert.equal(remaining.latestCommentAt, at); assert.equal(remaining.preview, "古いコメント");
  for (let reporter = 1; reporter <= 3; reporter++) {
    await reportComment({ shareId: "moderated", commentId: "old", reporterUserId: `reporter-${reporter}`, reason: "spam", client });
    assert.equal((await listOwnerCommentInbox("owner-a", null, client)).items.length, reporter < 3 ? 1 : 0);
  }
  await comment("delete-by-author", "moderated");
  await comment("delete-by-owner", "moderated");
  for (const [id, actor] of [["delete-by-author", "comment-author-private"], ["delete-by-owner", "owner-a"]]) {
    assert.deepEqual(await moderateComment({ shareId: "moderated", commentId: id, actorUserId: actor, action: "delete", client }), { outcome: "moderated" });
  }
  assert.deepEqual(await listOwnerCommentInbox("owner-a", null, client), { items: [], nextCursor: null });
});

test("one bounded aggregate per page with deterministic keyset pagination and owner-scoped foreign cursors", async () => {
  for (let i = 0; i < 45; i++) {
    const id = `share-${String(i).padStart(2, "0")}`;
    await share(id); await comment(`c-${id}`, id);
  }
  await share("foreign", "owner-b"); await comment("c-foreign", "foreign", "foreign", later);
  const execute = client.execute.bind(client);
  let reads = 0;
  let maxRows = 0;
  client.execute = async (...args: Parameters<typeof client.execute>) => {
    reads++;
    const result = await execute(...args);
    maxRows = Math.max(maxRows, result.rows.length);
    return result;
  };
  const first = await listOwnerCommentInbox("owner-a", null, client);
  assert.equal(reads, 1); assert.equal(first.items.length, OWNER_COMMENT_INBOX_PAGE_SIZE);
  const second = await listOwnerCommentInbox("owner-a", parseOwnerCommentInboxCursor(first.nextCursor!), client);
  assert.equal(reads, 2);
  const third = await listOwnerCommentInbox("owner-a", parseOwnerCommentInboxCursor(second.nextCursor!), client);
  assert.equal(reads, 3); assert.equal(third.items.length, 5); assert.equal(third.nextCursor, null);
  const ids = [...first.items, ...second.items, ...third.items].map((item) => item.shareId);
  assert.equal(new Set(ids).size, 45); assert.deepEqual(ids, [...ids].sort().reverse());
  assert.equal(maxRows, OWNER_COMMENT_INBOX_PAGE_SIZE + 1);
  const foreignCursor = await listOwnerCommentInbox("owner-a", { shareId: "foreign", latestCommentAt: later }, client);
  assert.deepEqual(foreignCursor, first);
});

test("API authentication fails before querying and all errors disable private caching", async () => {
  let calls = 0;
  const get = createOwnerCommentInboxHandler({
    requireUserId: async () => { throw new AppError({ message: "ログインが必要です。", status: 401, code: "UNAUTHORIZED", expose: true }); },
    list: async () => { calls++; return { items: [], nextCursor: null }; }
  });
  const response = await get(request("?shareId=foreign"));
  assert.equal(response.status, 401); assert.equal(calls, 0);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await response.json()).error, "ログインが必要です。");
});

test("API rejects owner/share injection, duplicate or malformed cursors, and stale account headers before querying", async () => {
  let calls = 0;
  const get = createOwnerCommentInboxHandler({ requireUserId: async () => "owner-a",
    list: async () => { calls++; return { items: [], nextCursor: null }; } });
  for (const query of ["?shareId=foreign", "?userId=owner-b", "?cursor=bad", "?cursor=", "?cursor=a&cursor=b", "?limit=10000"]) {
    const response = await get(request(query));
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.doesNotMatch(JSON.stringify(await response.json()), /foreign|owner-b/);
  }
  assert.equal((await get(request("", { "x-comment-inbox-owner": "owner-b" }))).status, 409);
  assert.equal(calls, 0);
  assert.equal((await get(request("", { "x-comment-inbox-owner": "owner-a" }))).status, 200);
  assert.equal(calls, 1);
});

test("API returns a safe DB failure and a successful retry without leaking internal details", async () => {
  let fail = true;
  const get = createOwnerCommentInboxHandler({ requireUserId: async () => "owner-a",
    list: async () => { if (fail) throw new Error("database fixture failure"); return { items: [], nextCursor: null }; } });
  const error = await get(request());
  assert.equal(error.status, 503);
  assert.equal(error.headers.get("Cache-Control"), "private, no-store");
  assert.doesNotMatch(JSON.stringify(await error.json()), /fixture|stack|SELECT/);
  fail = false;
  const retried = await get(request());
  assert.equal(retried.status, 200);
  assert.deepEqual(await retried.json(), { items: [], nextCursor: null });
});

test("safe links use each existing share route and previews preserve plain text with Unicode bounds", () => {
  for (const [kind, prefix] of [["tier", "/share/"], ["dashboard", "/dashboard/share/"], ["watchlist", "/watchlist/share/"]] as const) {
    assert.equal(ownerCommentShareHref({ kind, shareId: "abc-_123" }), `${prefix}abc-_123`);
    assert.equal(ownerCommentShareHref({ kind, shareId: "../?evil#" }), `${prefix}..%2F%3Fevil%23`);
    const route = path.join(process.cwd(), "app", prefix, "[shareId]", "page.tsx");
    assert.match(readFileSync(route, "utf8"), /export default/);
  }
  assert.equal(ownerCommentPreview("<script>alert(1)</script>\n本文"), "<script>alert(1)</script>\n本文");
  assert.equal(ownerCommentPreview("あ".repeat(120)), "あ".repeat(120));
  assert.equal(ownerCommentPreview("あ".repeat(121)), "あ".repeat(119) + "…");
  for (const value of ["", `${at}|../bad`, "2026-99-99T01:00:00.000Z|a", `${at}|a|b`]) assert.equal(parseOwnerCommentInboxCursor(value), null);
});
