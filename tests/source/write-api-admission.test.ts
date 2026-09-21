import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const BROWSER_JSON_WRITES = [
  "app/api/shares/[shareId]/comments/route.ts",
  "app/api/shares/[shareId]/reactions/route.ts",
  "app/api/shares/route.ts",
  "app/api/share/season/route.ts",
  "app/api/evangelist/route.ts",
] as const;

const BROWSER_NO_BODY_WRITES = [
  "app/api/dashboard/shares/route.ts",
  "app/api/watchlist/shares/route.ts",
] as const;

const COOKIE_CAPABLE_JSON_WRITES = [
  "app/api/statuses/route.ts",
  "app/api/statuses/[animeId]/route.ts",
  "app/api/watchlist/route.ts",
  "app/api/boards/route.ts",
  "app/api/subscriptions/route.ts",
  "app/api/account/route.ts",
  "app/api/push/subscribe/route.ts",
  "app/api/push/native/route.ts",
] as const;

test("browser JSON writes: origin + rate limit + decode-before-json helper", () => {
  for (const relativePath of BROWSER_JSON_WRITES) {
    const source = readSource(relativePath);
    assert.match(source, /assertSameOriginBrowserWrite/, relativePath);
    assert.match(source, /consumeWriteRateLimit/, relativePath);
    assert.match(source, /readJsonWithByteLimit/, relativePath);
    assert.doesNotMatch(source, /await\s+request\.json\s*\(/, relativePath);
    assert.doesNotMatch(source, /await\s+request\.text\s*\(/, relativePath);
  }
});

test("browser no-body share creates still get origin + rate limit", () => {
  for (const relativePath of BROWSER_NO_BODY_WRITES) {
    const source = readSource(relativePath);
    assert.match(source, /assertSameOriginBrowserWrite/, relativePath);
    assert.match(source, /consumeWriteRateLimit/, relativePath);
    assert.match(source, /policy:\s*"shareCreate"/, relativePath);
  }
});

test("cookie-capable writes distinguish Bearer vs session and cap JSON", () => {
  for (const relativePath of COOKIE_CAPABLE_JSON_WRITES) {
    const source = readSource(relativePath);
    assert.match(source, /requireWriteIdentity/, relativePath);
    assert.match(source, /admitCookieCapableWrite/, relativePath);
    assert.match(source, /readJsonWithByteLimit/, relativePath);
    assert.doesNotMatch(source, /await\s+request\.json\s*\(/, relativePath);
    assert.doesNotMatch(source, /await\s+request\.text\s*\(/, relativePath);
  }
});

test("native auth exchange is IP-rate-limited without cookie CSRF gate", () => {
  const source = readSource("app/api/auth/native/route.ts");
  assert.match(source, /consumeWriteRateLimit/);
  assert.match(source, /readJsonWithByteLimit/);
  assert.doesNotMatch(source, /admitCookieCapableWrite/);
  assert.doesNotMatch(source, /assertSameOriginBrowserWrite/);
});

test("feedback remains anonymous and caps multipart before formData", () => {
  const source = readSource("app/api/feedback/route.ts");
  assert.match(source, /consumeWriteRateLimit/);
  assert.match(source, /requireIp:\s*true/);
  assert.match(source, /policy:\s*"feedback"/);
  assert.match(source, /readFormDataWithByteLimit/);
  assert.doesNotMatch(source, /x-forwarded-for|user-agent|headers\.get\(["']cookie/i);
  assert.doesNotMatch(source, /auth\(|from\s+["']@\/auth/);
  assert.doesNotMatch(source, /request\.formData\s*\(/);
});

test("S2 leaves image-proxy out of scope and runbook records DNS-bound egress blocker", () => {
  const route = readSource("app/api/image-proxy/route.ts");
  assert.doesNotMatch(route, /from\s+["']@\/lib\/api\/write-admission["']/);
  assert.doesNotMatch(route, /from\s+["']@\/lib\/api\/write-request-guard["']/);
  assert.doesNotMatch(route, /image-proxy-guard/);
  assert.doesNotMatch(route, /consumeWriteRateLimit/);

  const runbook = readSource("docs/security/write-api-protection.md");
  assert.match(runbook, /DNS-bound egress/);
  assert.match(runbook, /残ギャップ/);
});

test("go outbound stays allowlisted GET without user URL", () => {
  const source = readSource("app/api/go/[serviceId]/route.ts");
  assert.match(source, /getServiceLandingUrl/);
  assert.doesNotMatch(source, /searchParams\.get\(\s*["']to["']/);
  assert.doesNotMatch(source, /export async function POST/);
});
