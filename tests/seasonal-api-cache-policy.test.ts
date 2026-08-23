import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const routeSource = readFileSync(
  path.join(projectRoot, "app/api/anime/seasonal/route.ts"),
  "utf8"
);

test("source contract: success response sets CDN Cache-Control", () => {
  assert.match(
    routeSource,
    /Cache-Control["']\s*:\s*["']public,\s*s-maxage=300,\s*stale-while-revalidate=86400["']/
  );
  assert.match(routeSource, /\bpublic\b/);
  assert.match(routeSource, /\bs-maxage=300\b/);
  assert.match(routeSource, /\bstale-while-revalidate=86400\b/);
});

test("source contract: response is not private/no-store", () => {
  assert.doesNotMatch(routeSource, /Cache-Control["']\s*:\s*["'][^"']*\bprivate\b/);
  assert.doesNotMatch(routeSource, /Cache-Control["']\s*:\s*["'][^"']*\bno-store\b/);
  assert.doesNotMatch(routeSource, /\bno-store\b/);
  assert.doesNotMatch(routeSource, /\bprivate\b/);
});

test("source contract: skipUncached remains; warmUncachedBudget stays absent", () => {
  assert.match(routeSource, /skipUncached\s*:\s*true/);
  assert.doesNotMatch(routeSource, /warmUncachedBudget/);
});

test("source contract: force-dynamic remains", () => {
  assert.match(
    routeSource,
    /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/
  );
});
