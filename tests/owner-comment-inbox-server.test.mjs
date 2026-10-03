import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { encode } from "next-auth/jwt";
import { chromium, expect } from "@playwright/test";
import { ensureShareSchema, moderateComment } from "../lib/shares.ts";

// Run after npm run build. Auth, route wiring, SQL and browser hydration are real;
// all identities, JWT keys and persisted data are generated local fixtures.
let server, browser, client, directory, baseUrl, ownerACookie, ownerBCookie;
const at = "2026-10-03T01:00:00.000Z";
before(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "atb-inbox-server-"));
  const dbUrl = pathToFileURL(path.join(directory, "test.db")).href;
  client = createClient({ url: dbUrl });
  await ensureShareSchema(client);
  for (const [id, owner, kind] of [["a-tier", "owner-a", null], ["b-tier", "owner-b", null], ["a-impressions", "owner-a", "season-impressions"]]) {
    const board = { version: 1, season: "FALL", seasonYear: 2026, tiers: [], updatedAt: at, ...(kind ? { kind } : {}) };
    await client.execute({ sql: `insert into board_shares (share_id, user_id, board_json, items_json, created_at, updated_at)
      values (?, ?, ?, '[]', ?, ?)`, args: [id, owner, JSON.stringify(board), at, at] });
    await client.execute({ sql: `insert into share_comments (comment_id, share_id, user_id, body, created_at, updated_at)
      values (?, ?, 'fixture-commenter', ?, ?, ?)`, args: [`c-${id}`, id, `${id} のコメント`, at, at] });
  }
  const port = await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
  baseUrl = `http://127.0.0.1:${port}`;
  const secret = randomBytes(32).toString("hex");
  const salt = "authjs.session-token";
  ownerACookie = await encode({ secret, salt, token: { sub: "owner-a", name: "所有者A" } });
  ownerBCookie = await encode({ secret, salt, token: { sub: "owner-b", name: "所有者B" } });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: path.resolve(import.meta.dirname, ".."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", AUTH_TRUST_HOST: "true",
      AUTH_URL: baseUrl, NEXTAUTH_URL: baseUrl, AUTH_SECRET: secret, NEXTAUTH_SECRET: secret,
      AUTH_GOOGLE_ID: "local-fixture", AUTH_GOOGLE_SECRET: "local-fixture",
      TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: "local-test-only" }
  });
  // Drain logs without printing request/session information.
  server.stdout.resume(); server.stderr.resume();
  const ready = Date.now() + 60_000;
  let started = false;
  while (Date.now() < ready) {
    if (server.exitCode !== null) throw new Error(`Local Next server exited: ${server.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/dashboard/comments`);
      if (response.status === 401) { started = true; break; }
    } catch { /* Wait for the local listener. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(started, "local production server must start and enforce authentication");
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    await new Promise((resolve) => { server.once("exit", resolve); server.kill(); });
  }
  client?.close();
  if (directory) {
    assert.ok(directory.startsWith(path.join(os.tmpdir(), "atb-inbox-server-")));
    try { rmSync(directory, { recursive: true, force: true }); }
    catch (error) { if (!["EPERM", "EBUSY"].includes(error.code)) throw error; }
  }
});

const cookieHeader = (value) => ({ Cookie: `authjs.session-token=${value}` });

test("built HTTP route enforces real JWT auth, ownership, no-store, parameter guards and season exclusion", async () => {
  const guest = await fetch(`${baseUrl}/api/dashboard/comments`);
  assert.equal(guest.status, 401);
  assert.equal(guest.headers.get("cache-control"), "private, no-store");
  for (const [cookie, id] of [[ownerACookie, "a-tier"], [ownerBCookie, "b-tier"]]) {
    const response = await fetch(`${baseUrl}/api/dashboard/comments`, { headers: cookieHeader(cookie) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.items.map((item) => item.shareId), [id]);
    assert.equal(result.items[0].commentCount, 1);
    assert.equal(result.items[0].latestCommentAt, at);
    assert.equal(result.items[0].preview, `${id} のコメント`);
    assert.doesNotMatch(JSON.stringify(result), /owner-|fixture-commenter|season-impressions/);
  }
  const injected = await fetch(`${baseUrl}/api/dashboard/comments?shareId=b-tier`, { headers: cookieHeader(ownerACookie) });
  assert.equal(injected.status, 400);
  const switched = await fetch(`${baseUrl}/api/dashboard/comments`, { headers: { ...cookieHeader(ownerBCookie), "x-comment-inbox-owner": "owner-a" } });
  assert.equal(switched.status, 409);
  const refused = await fetch(`${baseUrl}/api/shares/a-impressions/comments`);
  assert.equal(refused.status, 403);
});

test("built dashboard hydrates at 375px, opens the real share page and reflects moderation on return", async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
  const errors = [];
  await context.addCookies([{ name: "authjs.session-token", value: ownerACookie, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/*", (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/dashboard`);
    const inbox = page.getByRole("region", { name: "共有へのコメント" });
    await expect(inbox.getByText("a-tier のコメント", { exact: true })).toBeVisible();
    await expect(inbox.getByText("b-tier のコメント", { exact: true })).toHaveCount(0);
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    assert.ok(await inbox.evaluate((element) => element.scrollWidth <= element.clientWidth));
    const link = inbox.getByRole("link", { name: /共有を開く/ });
    await link.focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${baseUrl}/share/a-tier`);
    assert.deepEqual(await moderateComment({ shareId: "a-tier", commentId: "c-a-tier", actorUserId: "owner-a", action: "hide", client }), { outcome: "moderated" });
    await page.goBack();
    await expect(inbox.getByText("共有へのコメントはまだありません。")).toBeVisible();
    await expect(inbox.getByText("a-tier のコメント", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "artifacts/owner-comment-inbox/built-dashboard.png", fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
