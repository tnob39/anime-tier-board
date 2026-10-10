import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChatGptLink, CHATGPT_HOME, PERSONAL_AI_URL_LIMIT } from "../lib/personal-ai-link";
test("exact unicode, whitespace and query-sensitive full text round trip", () => {
  const prompt = "日本語😀\n A & ? # + %\n";
  const url = buildChatGptLink(prompt)!;
  assert.equal(new URL(url).searchParams.get("q"), prompt);
  assert.ok(url.length <= PERSONAL_AI_URL_LIMIT);
});
test("complete encoded URL bound is inclusive; never truncate", () => {
  const prefix = `${CHATGPT_HOME}?q=`;
  const prompt = "a".repeat(PERSONAL_AI_URL_LIMIT - prefix.length);
  assert.equal(buildChatGptLink(prompt)?.length, PERSONAL_AI_URL_LIMIT);
  assert.equal(buildChatGptLink(prompt + "a"), null);
  assert.equal(buildChatGptLink("日".repeat(1400)), null);
  assert.equal(buildChatGptLink(""), null);
  assert.equal(buildChatGptLink("\ud800"), null);
});
