import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTursoClient, resetTursoClientForTests } from "../lib/turso.ts";
import { listSeasonImpressions, readImpressionSeasonState, saveSeasonImpression, deleteSeasonImpression } from "../lib/season-impressions.ts";
import { buildImpressionSnapshot, parseImpressionInput, impressionNoteLength, type ImpressionInput, type ImpressionShareInput } from "../lib/season-impressions-model.ts";
import { createImpressionShare, getImpressionShare, listImpressionShares, stopImpressionShare } from "../lib/season-impression-shares.ts";
import { createShare, createWatchlistShare, createDashboardShare, getShare, getWatchlistShare, getDashboardShare, addComment, setReaction, listComments, SHARE_INTERACTIONS_DISABLED } from "../lib/shares.ts";
import { createImpressionHandlers } from "../lib/api/season-impressions-handlers.ts";
import { createShareHandlers } from "../lib/api/impression-share-handlers.ts";
import { createCommentsPostHandler, createCommentsDeleteHandler, GET as commentsGET } from "../app/api/shares/[shareId]/comments/route.ts";
import { createReportPostHandler } from "../app/api/shares/[shareId]/comments/[commentId]/report/route.ts";
import { createReactionsPostHandler } from "../app/api/shares/[shareId]/reactions/route.ts";
import { deleteUserAccountData } from "../lib/account-deletion.ts";
import { exportUserAccountData } from "../lib/account-export.ts";
import { resetWriteAdmissionForTests, seedWriteAdmissionBucketForTests, WRITE_BODY_MAX_BYTES } from "../lib/api/write-admission.ts";
import { AppError } from "../lib/errors/app-error.ts";
import { readImpressionDraft, readOwnerImpressionDrafts, ownerImpressionDraftKey, impressionReturnPath, IMPRESSION_DRAFT_TTL } from "../lib/season-impression-draft.ts";
import { getCurrentAnimeSeason, seasonHeadingJa } from "../lib/season.ts";

const key = { year: 2026, season: "FALL" as const };
const origin = "https://anime-tier-board.test";
const input = (extra: Partial<ImpressionInput> = {}): ImpressionInput => ({ ...key, revision: 0,
  anime: { id: "anilist-1", source: "anilist", title: "日本語の作品", imageUrl: "https://s4.anilist.co/file/cover.jpg" },
  rating: null, note: null, spoiler: "unspecified", ...extra });
const context = (animeId = "anilist-1") => ({ params: Promise.resolve({ animeId }) });
const shareContext = (shareId: string) => ({ params: Promise.resolve({ shareId }) });
const request = (route: string, method = "GET", body?: unknown, headers: HeadersInit = {}) => new Request(`${origin}${route}`, {
  method, headers: { origin, "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
const handlers = (userId = "owner") => createImpressionHandlers({ identity: async () => ({ userId, source: "session" }) });
const shares = (userId = "owner") => createShareHandlers({ session: async () => ({ user: { id: userId } }) });
function selection(revision: number, extras = {}): ImpressionShareInput {
  return { kind: "season-impressions", ...key, selections: [{ animeId: "anilist-1", revision, includeRating: true, includeNote: true, ...extras }] };
}
let directory: string;
let previousUrl: string | undefined;
let previousToken: string | undefined;
beforeEach(() => {
  const root = path.resolve(".next", "impression-tests");
  mkdirSync(root, { recursive: true });
  directory = mkdtempSync(path.join(root, "db-"));
  previousUrl = process.env.TURSO_DATABASE_URL;
  previousToken = process.env.TURSO_AUTH_TOKEN;
  resetTursoClientForTests();
  process.env.TURSO_DATABASE_URL = pathToFileURL(path.join(directory, "local.db")).href;
  process.env.TURSO_AUTH_TOKEN = "local-test";
  resetWriteAdmissionForTests();
});
afterEach(() => {
  resetTursoClientForTests();
  if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL; else process.env.TURSO_DATABASE_URL = previousUrl;
  if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN; else process.env.TURSO_AUTH_TOKEN = previousToken;
  const root = path.resolve(".next", "impression-tests");
  assert.ok(directory.startsWith(root + path.sep));
  try { rmSync(directory, { recursive: true, force: true }); }
  catch (error) {
    // libSQL can retain a Windows file handle until process exit; artifacts stay under .next.
    if (!["EPERM", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
});

test("CRUD persists checking only, rating only and Unicode notes across database reopen", async () => {
  const checking = await saveSeasonImpression("owner", input());
  assert.equal(checking?.revision, 1);
  assert.equal(checking?.rating, null);
  assert.equal(checking?.note, null);
  const rating = await saveSeasonImpression("owner", input({ revision: 1, rating: "not_for_me" }));
  assert.equal(rating?.revision, 2);
  assert.equal(rating?.checkedAt, checking?.checkedAt);
  const text = "感想😀".repeat(46) + "良い";
  assert.equal(impressionNoteLength(text), 140);
  const note = await saveSeasonImpression("owner", input({ revision: 2, rating: "liked", note: text, spoiler: "no_spoiler" }));
  assert.equal(note?.revision, 3);
  resetTursoClientForTests();
  const loaded = await listSeasonImpressions("owner", key);
  assert.deepEqual(loaded, [note]);
  assert.equal(await saveSeasonImpression("owner", input()), null);
});

test("ownership, season and source-prefixed IDs stay distinct even when titles match", async () => {
  await saveSeasonImpression("owner", input({ note: "owner-private" }));
  await saveSeasonImpression("other", input({ note: "other-private" }));
  await saveSeasonImpression("owner", input({ season: "SUMMER" }));
  await saveSeasonImpression("owner", input({ anime: { ...input().anime, id: "jikan-1", source: "jikan" } }));
  assert.equal((await listSeasonImpressions("owner", key)).length, 2);
  assert.equal((await listSeasonImpressions("other", key))[0].note, "other-private");
  assert.equal(await saveSeasonImpression("stranger", input({ revision: 1 })), null);
  assert.equal(await deleteSeasonImpression("stranger", "anilist-1", { ...key, revision: 1 }), null);
  assert.equal((await listSeasonImpressions("owner", key))[0].note, "owner-private");
});

test("concurrent updates compare revision atomically; deleted/recreated records reject stale edits", async () => {
  await saveSeasonImpression("owner", input());
  const writes = await Promise.all([saveSeasonImpression("owner", input({ revision: 1, note: "one" })), saveSeasonImpression("owner", input({ revision: 1, note: "two" }))]);
  assert.equal(writes.filter(Boolean).length, 1);
  assert.equal(await deleteSeasonImpression("owner", "anilist-1", { ...key, revision: 1 }), null);
  assert.deepEqual(await deleteSeasonImpression("owner", "anilist-1", { ...key, revision: 2 }), { animeId: "anilist-1", revision: 3 });
  assert.deepEqual(await listSeasonImpressions("owner", key), []);
  const tombstone = (await getTursoClient().execute("select * from season_impressions")).rows[0];
  assert.equal(tombstone.note, null);
  assert.equal(tombstone.anime_json, "{}");
  assert.equal(await saveSeasonImpression("owner", input()), null, "delayed revision:0 must not resurrect the tombstone");
  resetTursoClientForTests();
  const state = await readImpressionSeasonState("owner", key);
  assert.deepEqual(state, { impressions: [], deletedRevisions: [{ animeId: "anilist-1", revision: 3 }] });
  const recreated = await saveSeasonImpression("owner", input({ revision: state.deletedRevisions[0].revision }));
  assert.equal(recreated?.revision, 4);
  assert.equal(await saveSeasonImpression("owner", input({ revision: 3 })), null, "recreation cursor is consumed atomically");
  assert.equal(await saveSeasonImpression("owner", input({ revision: 1, note: "stale" })), null);
  assert.equal(await saveSeasonImpression("owner", input({ revision: 2, note: "stale" })), null);
});

test("GET/PUT/DELETE routes enforce auth, ownership, explicit save and 409", async () => {
  const api = handlers();
  assert.equal((await api.PUT(request("/api/season-impressions/anilist-1", "PUT", input()), context())).status, 200);
  assert.equal((await api.PUT(request("/api/season-impressions/anilist-1", "PUT", input()), context())).status, 409);
  const other = handlers("other");
  const read = await other.GET(request("/api/season-impressions?year=2026&season=FALL&userId=owner"));
  assert.deepEqual(await read.json(), { impressions: [], deletedRevisions: [] });
  assert.match(read.headers.get("cache-control")!, /no-store/);
  assert.equal((await other.DELETE(request("/api/season-impressions/anilist-1", "DELETE", { ...key, revision: 1 }), context())).status, 409);
  const unauthorized = createImpressionHandlers({ identity: async () => { throw new AppError({ message: "ログインが必要です。", status: 401, code: "UNAUTHORIZED", expose: true }); } });
  for (const method of ["PUT", "DELETE"] as const) assert.equal((await unauthorized[method](request("/api/season-impressions/anilist-1", method, input()), context())).status, 401);
  assert.equal((await unauthorized.GET(request("/api/season-impressions?year=2026&season=FALL"))).status, 401);
  assert.equal((await api.DELETE(request("/api/season-impressions/anilist-1", "DELETE", { ...key, revision: 1 }), context())).status, 200);
  assert.deepEqual((await (await api.GET(request("/api/season-impressions?year=2026&season=FALL"))).json()).impressions, []);
});

test("route validation rejects malformed values and counts Unicode code points", async () => {
  const api = handlers();
  const invalid = [null, [], {}, input({ year: 0 }), input({ season: "BAD" as never }), input({ revision: -1 }),
    { ...input(), userId: "victim" }, input({ rating: "completed" as never }), input({ note: "😀".repeat(141) }),
    input({ note: "\ud800" }), input({ note: "\u0000" }), input({ spoiler: "safe" as never }),
    input({ anime: { ...input().anime, id: "anilist-2" } }), input({ anime: { ...input().anime, source: "jikan" } }),
    input({ anime: { ...input().anime, imageUrl: "javascript:alert(1)" } })];
  for (const body of invalid) assert.equal((await api.PUT(request("/api/season-impressions/anilist-1", "PUT", body), context())).status, 400, JSON.stringify(body));
  for (const id of ["1", "anilist:1", "anilist-0", "jikan-1/../../", "other-1"]) assert.equal((await api.PUT(request("/x", "PUT", input()), context(id))).status, 400);
  assert.equal((await api.PUT(request("/x", "PUT", input({ note: "😀".repeat(140) })), context())).status, 200);
  for (const query of ["?year=2026", "?season=FALL", "?year=2026.1&season=FALL", "?year=2101&season=FALL", "?year=2026&season=banana", "?year=2e3&season=FALL", "?year=&season=FALL"]) assert.equal((await api.GET(request(`/api/season-impressions${query}`))).status, 400);
  assert.equal((await api.DELETE(request("/x", "DELETE", { ...key, revision: 0 }), context())).status, 400);
});

test("write admission rejects cross-origin, malformed/oversize JSON and exhausted user limits", async () => {
  const api = handlers();
  const cross = request("/x", "PUT", input(), { origin: "https://elsewhere.test" });
  assert.equal((await api.PUT(cross, context())).status, 403);
  assert.equal(cross.bodyUsed, false);
  assert.equal((await api.DELETE(request("/x", "DELETE", { ...key, revision: 1 }, { origin: "https://elsewhere.test" }), context())).status, 403);
  const malformed = new Request(`${origin}/x`, { method: "PUT", headers: { origin }, body: "{" });
  assert.equal((await api.PUT(malformed, context())).status, 400);
  assert.equal((await api.PUT(request("/x", "PUT", input(), { "content-length": String(WRITE_BODY_MAX_BYTES.status + 1) }), context())).status, 413);
  assert.equal((await api.PUT(request("/x", "PUT", "x".repeat(WRITE_BODY_MAX_BYTES.status + 1)), context())).status, 413);
  assert.equal((await api.PUT(request("/x", "PUT", input(), { "idempotency-key": "bad key" }), context())).status, 400);
  seedWriteAdmissionBucketForTests("userWrite:user:owner", 120, Date.now() + 60_000);
  const limited = await api.PUT(request("/x", "PUT", input()), context());
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await api.DELETE(request("/x", "DELETE", { ...key, revision: 1 }), context())).status, 429);
  assert.deepEqual(await listSeasonImpressions("owner", key), []);
});

test("owner-only tombstone cursors reject delayed creates and allow explicit recreation after reload", async () => {
  const api = handlers();
  await api.PUT(request("/x", "PUT", input({ note: "erased-private" })), context());
  const removed = await api.DELETE(request("/x", "DELETE", { ...key, revision: 1 }), context());
  assert.deepEqual(await removed.json(), { ok: true, cursor: { animeId: "anilist-1", revision: 2 } });
  assert.equal((await api.PUT(request("/x", "PUT", input()), context())).status, 409);
  assert.equal((await api.PUT(request("/x", "PUT", input({ revision: 1 })), context())).status, 409);
  const ownerState = await api.GET(request("/api/season-impressions?year=2026&season=FALL"));
  assert.match(ownerState.headers.get("cache-control")!, /private, no-store/);
  const state = await ownerState.json();
  assert.deepEqual(state, { impressions: [], deletedRevisions: [{ animeId: "anilist-1", revision: 2 }] });
  assert.doesNotMatch(JSON.stringify(state), /erased-private|title|checkedAt|userId/);
  for (const [who, query] of [["other", "year=2026&season=FALL&userId=owner"], ["owner", "year=2026&season=SUMMER"]]) {
    assert.deepEqual(await (await handlers(who).GET(request(`/api/season-impressions?${query}`))).json(), { impressions: [], deletedRevisions: [] });
  }
  const jikan = input({ anime: { ...input().anime, id: "jikan-1", source: "jikan" } });
  assert.equal((await api.PUT(request("/x", "PUT", jikan), context("jikan-1"))).status, 200);
  const results = await Promise.all([0, 1].map(() => api.PUT(request("/x", "PUT", input({ revision: state.deletedRevisions[0].revision })), context())));
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await listSeasonImpressions("owner", key)).find((row) => row.anime.id === "anilist-1")?.revision, 3);
});

test("stale account UI is rejected before reading private writes, reads or share selections", async () => {
  const headers = { "X-Impression-Owner": encodeURIComponent("original-owner") };
  const api = handlers("new-owner");
  for (const method of ["PUT", "DELETE"] as const) {
    const req = request("/x", method, input(), headers);
    assert.equal((await api[method](req, context())).status, 401);
    assert.equal(req.bodyUsed, false);
  }
  assert.equal((await api.GET(request("/api/season-impressions?year=2026&season=FALL", "GET", undefined, headers))).status, 401);
  const shareApi = shares("new-owner");
  const post = request("/api/shares", "POST", selection(1), headers);
  assert.equal((await shareApi.POST(post)).status, 401);
  assert.equal(post.bodyUsed, false);
  assert.equal((await shareApi.DELETE(request("/api/shares/x", "DELETE", undefined, headers), shareContext("x"))).status, 401);
  assert.equal((await shareApi.LIST(request("/api/shares?kind=season-impressions", "GET", undefined, headers))).status, 401);
  assert.deepEqual(await listSeasonImpressions("new-owner", key), []);
});

test("all new admission paths await asynchronous allow/deny/failure before consuming bodies or mutating", async () => {
  for (const path of ["put", "delete", "share", "board", "stop"] as const) {
    for (const outcome of ["allow", "deny", "fail"] as const) {
      let release!: (result: Response | null) => void;
      let reject!: (reason: Error) => void;
      const gate = new Promise<Response | null>((resolve, fail) => { release = resolve; reject = fail; });
      let writes = 0;
      const api = createImpressionHandlers({ identity: async () => ({ userId: "owner", source: "session" }), admit: () => gate,
        save: async () => { writes++; return { ...input(), revision: 1, checkedAt: "now", updatedAt: "now" }; },
        remove: async () => { writes++; return { animeId: "anilist-1", revision: 2 }; } });
      const shareApi = createShareHandlers({ session: async () => ({ user: { id: "owner" } }), rateLimit: () => gate,
        create: async () => { writes++; return "created"; }, createBoard: async () => { writes++; return "board"; }, stop: async () => { writes++; return true; } });
      const body = path === "put" ? input() : path === "delete" ? { ...key, revision: 1 } : path === "board"
        ? { board: { version: 1, season: key.season, seasonYear: key.year, tiers: [], updatedAt: "now" }, items: [] } : selection(1);
      const req = request("/x", path === "put" ? "PUT" : path === "delete" || path === "stop" ? "DELETE" : "POST", body);
      let settled = false;
      const operation = (path === "put" ? api.PUT(req, context()) : path === "delete" ? api.DELETE(req, context())
        : path === "stop" ? shareApi.DELETE(req, shareContext("share-1")) : shareApi.POST(req)).then((response) => { settled = true; return response; });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, false, `${path}: response cannot precede admission`);
      assert.equal(req.bodyUsed, false, `${path}: admission precedes body parsing`);
      assert.equal(writes, 0);
      if (outcome === "fail") reject(new Error("admission unavailable"));
      else release(outcome === "allow" ? null : Response.json({ error: "limited" }, { status: 503, headers: { "Retry-After": "7" } }));
      const response = await operation;
      assert.equal(response.status, outcome === "allow" ? 200 : outcome === "deny" ? 503 : 500, `${path}: ${outcome}`);
      assert.equal(writes, outcome === "allow" ? 1 : 0);
      assert.equal(req.bodyUsed, outcome === "allow");
      if (outcome === "deny") assert.equal(response.headers.get("retry-after"), "7");
    }
  }
});

test("snapshot privacy matrix: only explicitly selected no_spoiler notes exist in public/storage payloads", async () => {
  for (const spoiler of ["unspecified", "has_spoiler", "no_spoiler"] as const) {
    for (const includeNote of [false, true]) {
      const existing = (await listSeasonImpressions("owner", key))[0];
      const saved = await saveSeasonImpression("owner", input({ revision: existing?.revision ?? 0, spoiler, note: "PRIVATE_OR_SELECTED", rating: "liked" }));
      const selected = selection(saved!.revision, { includeNote, includeRating: false });
      const preview = buildImpressionSnapshot(selected, [saved!]);
      const shareId = await createImpressionShare("owner", selected);
      assert.ok(shareId);
      const share = await getImpressionShare(shareId);
      assert.deepEqual(share?.items, preview?.items);
      const expected = includeNote && spoiler === "no_spoiler";
      assert.equal("note" in share!.items[0], expected);
      assert.equal("rating" in share!.items[0], false);
      const raw = JSON.stringify(share);
      assert.equal(raw.includes("PRIVATE_OR_SELECTED"), expected);
      assert.doesNotMatch(raw, /userId|user_id|spoiler|checkedAt|revision|episodes|profile/);
      const stored = (await getTursoClient().execute({ sql: "select board_json, items_json from board_shares where share_id = ?", args: [shareId] })).rows[0];
      assert.equal(JSON.stringify(stored).includes("PRIVATE_OR_SELECTED"), expected);
      assert.equal(await getShare(shareId), null);
      assert.equal(await getWatchlistShare(shareId), null);
      assert.equal(await getDashboardShare(shareId), null);
      const publicResponse = await shares().GET(request(`/api/shares/${shareId}`), shareContext(shareId));
      assert.equal(publicResponse.status, 200);
      assert.match(publicResponse.headers.get("cache-control")!, /no-store/);
      assert.equal(JSON.stringify(await publicResponse.json()).includes("PRIVATE_OR_SELECTED"), expected);
    }
  }
});

test("anime snapshots project allowed display fields and never merge IDs/titles", async () => {
  const raw = { ...input(), anime: { ...input().anime, privateNote: "HIDDEN", episodes: 99, profile: { name: "HIDDEN" }, titles: { native: "HIDDEN" } } };
  const parsed = parseImpressionInput(raw, "anilist-1");
  assert.ok(parsed);
  assert.deepEqual(parsed.anime, input().anime);
  const result = await handlers().PUT(request("/x", "PUT", raw), context());
  assert.equal(result.status, 200);
  const id = await createImpressionShare("owner", selection(1));
  assert.doesNotMatch(JSON.stringify(await getImpressionShare(id!)), /HIDDEN|episodes|profile/);
});

test("shares are immutable; stale/missing/non-owned selections fail atomically with 409", async () => {
  await saveSeasonImpression("owner", input({ note: "published", spoiler: "no_spoiler" }));
  const created = await shares().POST(request("/api/shares", "POST", selection(1)));
  assert.equal(created.status, 200);
  const { shareId } = await created.json();
  await saveSeasonImpression("owner", input({ revision: 1, note: "PRIVATE_EDIT", spoiler: "has_spoiler" }));
  assert.equal((await getImpressionShare(shareId))!.items[0].note, "published");
  assert.equal((await shares().POST(request("/api/shares", "POST", selection(1)))).status, 409);
  assert.equal((await shares("stranger").POST(request("/api/shares", "POST", selection(2)))).status, 409);
  const mixed = selection(2);
  mixed.selections.push({ animeId: "jikan-9", revision: 1, includeNote: false, includeRating: false });
  assert.equal((await shares().POST(request("/api/shares", "POST", mixed))).status, 409);
  assert.equal((await listImpressionShares("owner")).length, 1);
  await deleteSeasonImpression("owner", "anilist-1", { ...key, revision: 2 });
  assert.equal((await getImpressionShare(shareId))!.items[0].note, "published");
});

test("share route validates explicit fields, authentication, origin, bytes and rate limit", async () => {
  const forgedLegacyShare = { board: { kind: "season-impressions", version: 1, season: key.season, seasonYear: key.year, tiers: [], updatedAt: "now" }, items: [{ note: "PRIVATE_INJECTION" }] };
  for (const invalid of [null, { kind: "other" }, { ...selection(1), userId: "victim" }, { ...selection(1), items: [] },
    { ...selection(1), selections: [] }, { ...selection(1), selections: [...selection(1).selections, ...selection(1).selections] },
    selection(1, { includeNote: "yes" }), selection(0), selection(1, { note: "injected" }), forgedLegacyShare]) {
    assert.equal((await shares().POST(request("/api/shares", "POST", invalid))).status, 400);
  }
  resetWriteAdmissionForTests();
  const noSession = createShareHandlers({ session: async () => null });
  assert.equal((await noSession.POST(request("/api/shares", "POST", selection(1)))).status, 401);
  assert.equal((await noSession.LIST(request("/api/shares?kind=season-impressions"))).status, 401);
  assert.equal((await shares().POST(request("/api/shares", "POST", selection(1), { origin: "https://bad.test" }))).status, 403);
  assert.equal((await shares().POST(request("/api/shares", "POST", "x".repeat(WRITE_BODY_MAX_BYTES.share + 1)))).status, 413);
  seedWriteAdmissionBucketForTests("shareCreate:user:owner", 10, Date.now() + 60_000);
  assert.equal((await shares().POST(request("/api/shares", "POST", selection(1)))).status, 429);
});

test("history/revocation are owner-only; revoked URLs cannot be fetched through public APIs", async () => {
  await saveSeasonImpression("owner", input());
  const id = (await createImpressionShare("owner", selection(1)))!;
  assert.deepEqual(await listImpressionShares("stranger"), []);
  assert.equal((await shares("stranger").DELETE(request(`/api/shares/${id}`, "DELETE"), shareContext(id))).status, 404);
  assert.ok(await getImpressionShare(id));
  assert.equal((await shares().DELETE(request(`/api/shares/${id}`, "DELETE", undefined, { origin: "https://bad.test" }), shareContext(id))).status, 403);
  assert.equal((await shares().DELETE(request(`/api/shares/${id}`, "DELETE", "x".repeat(4097)), shareContext(id))).status, 413);
  assert.equal((await shares().DELETE(request(`/api/shares/${id}`, "DELETE"), shareContext(id))).status, 200);
  assert.equal(await getImpressionShare(id), null);
  assert.equal(await getShare(id), null);
  assert.equal((await shares().GET(request(`/api/shares/${id}`), shareContext(id))).status, 404);
  assert.deepEqual(await listImpressionShares("owner"), []);
  assert.equal(await stopImpressionShare("owner", id), false);
});

test("comments/reactions are rejected at DB and actual API handler levels for this kind", async () => {
  await saveSeasonImpression("owner", input());
  const id = (await createImpressionShare("owner", selection(1)))!;
  await assert.rejects(() => addComment({ shareId: id, userId: "other", body: "hello" }), { message: SHARE_INTERACTIONS_DISABLED });
  await assert.rejects(() => setReaction(id, "other", "like"), { message: SHARE_INTERACTIONS_DISABLED });
  await assert.rejects(() => listComments(id), { message: SHARE_INTERACTIONS_DISABLED });
  const comments = createCommentsPostHandler(async () => ({ user: { id: "other" } }));
  const reactions = createReactionsPostHandler(async () => ({ user: { id: "other" } }));
  assert.equal((await comments(request(`/api/shares/${id}/comments`, "POST", { body: "hello" }), shareContext(id))).status, 403);
  assert.equal((await reactions(request(`/api/shares/${id}/reactions`, "POST", { kind: "like" }), shareContext(id))).status, 403);
  assert.equal((await commentsGET(request(`/api/shares/${id}/comments`), shareContext(id))).status, 403);
  const remove = createCommentsDeleteHandler({ getSession: async () => ({ user: { id: "owner" } }) });
  const report = createReportPostHandler({ getSession: async () => ({ user: { id: "other" } }) });
  assert.equal((await remove(request(`/api/shares/${id}/comments?commentId=missing`, "DELETE"), shareContext(id))).status, 403);
  assert.equal((await report(request(`/api/shares/${id}/comments/missing/report`, "POST", { reason: "spoiler" }), { params: Promise.resolve({ shareId: id, commentId: "missing" }) })).status, 403);
  assert.equal(Number((await getTursoClient().execute("select count(*) n from share_comments")).rows[0].n), 0);
  assert.equal(Number((await getTursoClient().execute("select count(*) n from share_reactions")).rows[0].n), 0);
});

test("existing board/watchlist/dashboard kinds and their interactions remain usable", async () => {
  const board = { version: 1, season: key.season, seasonYear: key.year, tiers: [], updatedAt: new Date().toISOString() };
  const tierId = await createShare("owner", board, []);
  const watchlistId = await createWatchlistShare("owner", []);
  const dashboardId = await createDashboardShare("owner", { marker: "existing-data" } as never);
  assert.deepEqual((await getShare(tierId))?.board, board);
  assert.equal((await getWatchlistShare(watchlistId))?.watchlist.kind, "watchlist");
  assert.equal((await getDashboardShare(dashboardId))?.dashboard.kind, "dashboard");
  for (const id of [tierId, watchlistId, dashboardId]) {
    assert.equal(await getImpressionShare(id), null);
    assert.equal(await stopImpressionShare("owner", id), false);
    await addComment({ shareId: id, userId: "reader", body: "still works" });
    assert.equal((await listComments(id))[0].body, "still works");
    assert.equal((await setReaction(id, "reader", "like")).reactionCounts.like, 1);
  }
  assert.equal((await shares().POST(request("/api/shares", "POST", { board, items: [] }))).status, 200);
  assert.deepEqual(await listImpressionShares("owner"), []);
});

test("account export includes private records and snapshots; deletion removes records/tombstones/shares only for owner", async () => {
  await saveSeasonImpression("owner", input({ note: "private-owner", spoiler: "has_spoiler" }));
  await saveSeasonImpression("other", input({ note: "private-other" }));
  const ownerShare = (await createImpressionShare("owner", selection(1)))!;
  const otherShare = (await createImpressionShare("other", selection(1)))!;
  const exported = await exportUserAccountData("owner");
  assert.equal(exported.data.seasonImpressions[0].note, "private-owner");
  assert.equal(exported.data.seasonImpressions[0].revision, 1);
  assert.equal(exported.data.boardShares[0].shareId, ownerShare);
  assert.doesNotMatch(JSON.stringify(exported), /private-other/);
  await deleteSeasonImpression("owner", "anilist-1", { ...key, revision: 1 });
  assert.deepEqual((await exportUserAccountData("owner")).data.seasonImpressions, []);
  await deleteUserAccountData("owner");
  await deleteUserAccountData("owner");
  assert.equal(Number((await getTursoClient().execute("select count(*) n from season_impressions where user_id = 'owner'")).rows[0].n), 0);
  assert.equal(await getImpressionShare(ownerShare), null);
  assert.ok(await getImpressionShare(otherShare));
  assert.equal((await listSeasonImpressions("other", key))[0].note, "private-other");
});

test("guest draft is bound to a token/TTL and returns only to the fixed season route", () => {
  const draft = { version: 2 as const, ownerId: null, token: "12345678-1234-1234-1234-123456789012", createdAt: Date.now(), input: input({ note: "ログイン前😀" }) };
  const raw = JSON.stringify(draft);
  assert.deepEqual(readImpressionDraft(raw, draft.token, "owner"), draft);
  assert.equal(readImpressionDraft(raw, null, "owner"), null);
  assert.equal(readImpressionDraft(raw, draft.token, null), null);
  assert.equal(readImpressionDraft(raw, "wrong", "owner"), null);
  assert.equal(readImpressionDraft(raw, draft.token, "owner", draft.createdAt + IMPRESSION_DRAFT_TTL + 1), null);
  assert.equal(readImpressionDraft(raw, draft.token, "owner", draft.createdAt - 1), null);
  assert.equal(readImpressionDraft("{", draft.token, "owner"), null);
  assert.equal(readImpressionDraft(JSON.stringify({ ...draft, input: { ...draft.input, userId: "victim" } }), draft.token, "owner"), null);
  for (const invalid of [{ ...draft, version: 1 }, { ...draft, ownerId: undefined }, { ...draft, ownerId: "other" }]) {
    assert.equal(readImpressionDraft(JSON.stringify(invalid), draft.token, "owner"), null);
  }
  const bound = { ...draft, ownerId: "owner" };
  assert.deepEqual(readImpressionDraft(JSON.stringify(bound), draft.token, "owner"), bound);
  assert.equal(readImpressionDraft(JSON.stringify(bound), draft.token, "other"), null);
  assert.equal(impressionReturnPath(draft), `/tier/impressions?year=2026&season=FALL&resume=${draft.token}`);
  assert.ok(!impressionReturnPath(draft).includes(encodeURIComponent(draft.input.note!)));
});

test("authenticated in-progress drafts require the same owner/season, preserve invalid-length input, and expire", () => {
  const draft = { version: 2, ownerId: "owner", createdAt: Date.now(), editing: "anilist-1", inputs: [input({ note: "あ".repeat(141) })] };
  const raw = JSON.stringify(draft);
  assert.deepEqual(readOwnerImpressionDrafts(raw, "owner", key), draft);
  assert.equal(readOwnerImpressionDrafts(raw, "other", key), null);
  assert.equal(readOwnerImpressionDrafts(raw, "owner", { ...key, year: 2025 }), null);
  assert.equal(readOwnerImpressionDrafts(raw, "owner", key, draft.createdAt + IMPRESSION_DRAFT_TTL + 1), null);
  assert.notEqual(ownerImpressionDraftKey("owner", key), ownerImpressionDraftKey("other", key));
});

test("dedicated public page HTML/metadata contains only snapshot fields and revoked pages return notFound", async () => {
  const { default: Page, metadata } = await import("../app/share/impressions/[shareId]/page.tsx");
  const { DisplayModeProvider } = await import("../components/display-mode/DisplayModeProvider.tsx");
  await saveSeasonImpression("owner", input({ note: "PRIVATE_SPOILER_HTML", spoiler: "has_spoiler" }));
  const shareId = (await createImpressionShare("owner", selection(1)))!;
  const tree = await Page({ params: Promise.resolve({ shareId }) });
  const html = renderToStaticMarkup(React.createElement(DisplayModeProvider, null, tree));
  assert.match(html, /日本語の作品/);
  assert.match(html, /確認済み/);
  assert.doesNotMatch(html, /PRIVATE_SPOILER_HTML|<textarea|reaction|comments|<img/);
  assert.doesNotMatch(JSON.stringify(metadata), /PRIVATE_SPOILER_HTML|日本語の作品/);
  assert.equal((metadata.robots as { index: boolean }).index, false);
  await stopImpressionShare("owner", shareId);
  await assert.rejects(() => Page({ params: Promise.resolve({ shareId }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
});

test("missing GET season follows every JST quarter boundary including the new year", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
  for (const [instant, expected] of [
    ["2025-12-31T14:59:59.999Z", { year: 2025, season: "FALL" }],
    ["2025-12-31T15:00:00.000Z", { year: 2026, season: "WINTER" }],
    ["2026-03-31T14:59:59.999Z", { year: 2026, season: "WINTER" }],
    ["2026-03-31T15:00:00.000Z", { year: 2026, season: "SPRING" }],
    ["2026-06-30T14:59:59.999Z", { year: 2026, season: "SPRING" }],
    ["2026-06-30T15:00:00.000Z", { year: 2026, season: "SUMMER" }],
    ["2026-09-30T14:59:59.999Z", { year: 2026, season: "SUMMER" }],
    ["2026-09-30T15:00:00.000Z", { year: 2026, season: "FALL" }],
    ["2026-12-31T15:00:00.000Z", { year: 2027, season: "WINTER" }]
  ] as const) {
    t.mock.timers.setTime(new Date(instant).getTime());
    let target: unknown;
    const api = createImpressionHandlers({ identity: async () => ({ userId: "owner", source: "session" }),
      list: async (_owner, key) => { target = key; return { impressions: [], deletedRevisions: [] }; } });
    const response = await api.GET(request("/api/season-impressions"));
    assert.equal(response.status, 200);
    assert.deepEqual(target, expected, instant);
    assert.match(response.headers.get("cache-control")!, /private, no-store/);
  }
});

test("normalized API inputs address released keys, revisions, tombstones and share snapshots", async () => {
  const api = handlers();
  await saveSeasonImpression("owner", input());
  const normalized = { year: " 2026 ", season: " fall " };
  const read = await api.GET(request("/api/season-impressions?year=%202026%20&season=%20fall%20"));
  assert.equal(read.status, 200);
  assert.equal((await read.json()).impressions[0].revision, 1);
  const update = await api.PUT(request("/api/season-impressions/anilist-1", "PUT", { ...input({ revision: 1 }), ...normalized }), context());
  assert.equal(update.status, 200);
  assert.deepEqual((await update.json()).impression, (await listSeasonImpressions("owner", key))[0]);
  const publish = await shares().POST(request("/api/shares", "POST", { ...selection(2), ...normalized }));
  assert.equal(publish.status, 200);
  const { shareId } = await publish.json();
  assert.equal((await getImpressionShare(shareId))?.season, "FALL");
  const removed = await api.DELETE(request("/api/season-impressions/anilist-1", "DELETE", { ...normalized, revision: 2 }), context());
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).cursor, { animeId: "anilist-1", revision: 3 });
  assert.equal((await api.PUT(request("/api/season-impressions/anilist-1", "PUT", { ...input(), ...normalized }), context())).status, 409);
  const rows = (await getTursoClient().execute("select season_year, season, revision from season_impressions")).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0] }, { season_year: 2026, season: "FALL", revision: 3 });
  assert.equal(ownerImpressionDraftKey("owner", key), "numanie:impressions:owner-drafts:v2:owner:2026:FALL");
});

test("editing page canonicalizes malformed/duplicate queries and preserves unrelated parameters", async () => {
  const { default: Page } = await import("../app/tier/impressions/page.tsx");
  for (const query of [{ year: "2e3", season: "SUMMER" }, { year: "2024" }, { year: "2101", season: "FALL" }, { year: "2024", season: "banana" }]) {
    const page = await Page({ searchParams: Promise.resolve({ ...query, keep: "1", resume: "token" }) });
    assert.deepEqual(page.props.seasonKey, getCurrentAnimeSeason());
    assert.equal(page.props.resumeToken, "token");
  }
  const duplicate = await Page({ searchParams: Promise.resolve({ year: ["2024", "2025"], season: "summer", keep: "1" }) });
  assert.deepEqual(duplicate.props.seasonKey, { year: 2024, season: "SUMMER" });
  const implicit = await Page({ searchParams: Promise.resolve({}) });
  assert.deepEqual(implicit.props.seasonKey, getCurrentAnimeSeason());
  const explicit = await Page({ searchParams: Promise.resolve({ year: "2024", season: "SUMMER" }) });
  assert.deepEqual(explicit.props.seasonKey, { year: 2024, season: "SUMMER" });
});

test("published season and Japanese heading stay fixed after edits, deletion and JST year rollover", async (t) => {
  const { default: Page } = await import("../app/share/impressions/[shareId]/page.tsx");
  const { DisplayModeProvider } = await import("../components/display-mode/DisplayModeProvider.tsx");
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-12-31T14:59:59.999Z") });
  await saveSeasonImpression("owner", input({ note: "公開時の一言", spoiler: "no_spoiler" }));
  const shareId = (await createImpressionShare("owner", selection(1)))!;
  const snapshot = await getImpressionShare(shareId);
  const render = async () => renderToStaticMarkup(React.createElement(DisplayModeProvider, null, await Page({ params: Promise.resolve({ shareId }) })));
  const before = await render();
  assert.match(before, new RegExp(`${seasonHeadingJa(key)} 今期チェック`));
  assert.doesNotMatch(before, /season-context-control|選択中の期|<select/);
  await saveSeasonImpression("owner", input({ revision: 1, note: "PRIVATE_CHANGED" }));
  await deleteSeasonImpression("owner", "anilist-1", { ...key, revision: 2 });
  t.mock.timers.setTime(new Date("2026-12-31T15:00:00.000Z").getTime());
  assert.deepEqual(getCurrentAnimeSeason(), { year: 2027, season: "WINTER" });
  assert.deepEqual(await getImpressionShare(shareId), snapshot);
  assert.equal(await render(), before);
});
