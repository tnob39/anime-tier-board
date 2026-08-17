import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_BODY_MIN,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_MULTIPART_MAX_BYTES,
  detectImageMimeFromBytes,
  normalizeFeedbackBody,
  validateFeedbackBody,
  validateFeedbackContentLength,
  validateFeedbackImageBytes,
  validateFeedbackLevel,
} from "../lib/feedback-shared.ts";
import {
  getAllowedFeedbackOrigins,
  isAllowedFeedbackOrigin,
  parseAndValidateFeedbackFormData,
} from "../lib/feedback.ts";

function jpegFixture(byteLength = 32): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
}

function pngFixture(byteLength = 32): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return bytes;
}

function webpFixture(byteLength = 32): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
}

test("validateFeedbackLevel accepts only enum values", () => {
  assert.equal(validateFeedbackLevel("idea"), "idea");
  assert.equal(validateFeedbackLevel("improvement"), "improvement");
  assert.equal(validateFeedbackLevel("problem"), "problem");
  assert.equal(validateFeedbackLevel("urgent"), "urgent");
  assert.equal(validateFeedbackLevel("critical"), null);
  assert.equal(validateFeedbackLevel(""), null);
  assert.equal(validateFeedbackLevel(null), null);
});

test("validateFeedbackBody enforces 10-2000 characters", () => {
  assert.equal(typeof validateFeedbackBody("短い"), "string");
  assert.equal(validateFeedbackBody("あ".repeat(FEEDBACK_BODY_MIN)), null);
  assert.equal(validateFeedbackBody("あ".repeat(FEEDBACK_BODY_MAX)), null);
  assert.equal(typeof validateFeedbackBody("あ".repeat(FEEDBACK_BODY_MAX + 1)), "string");
  assert.equal(typeof validateFeedbackBody("123456789"), "string");
});

test("normalizeFeedbackBody trims edges and normalizes newlines", () => {
  assert.equal(normalizeFeedbackBody("  hello\r\nworld  "), "hello\nworld");
  assert.equal(normalizeFeedbackBody(12), "");
});

test("detectImageMimeFromBytes identifies jpeg/png/webp only", () => {
  assert.equal(detectImageMimeFromBytes(jpegFixture()), "image/jpeg");
  assert.equal(detectImageMimeFromBytes(pngFixture()), "image/png");
  assert.equal(detectImageMimeFromBytes(webpFixture()), "image/webp");
  assert.equal(detectImageMimeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), null);
});

test("validateFeedbackImageBytes rejects oversize and bad types", () => {
  assert.equal(validateFeedbackImageBytes(jpegFixture(), "image/jpeg"), null);
  assert.equal(
    typeof validateFeedbackImageBytes(new Uint8Array(FEEDBACK_IMAGE_MAX_BYTES + 1), "image/jpeg"),
    "string"
  );
  assert.equal(typeof validateFeedbackImageBytes(jpegFixture(), "image/gif"), "string");
  assert.equal(typeof validateFeedbackImageBytes(jpegFixture(), "image/png"), "string");
});

test("Origin allowlist is fail-closed without Origin", () => {
  assert.equal(isAllowedFeedbackOrigin(null), false);
  assert.equal(isAllowedFeedbackOrigin(""), false);
  assert.equal(
    isAllowedFeedbackOrigin("https://evil.example", {
      AUTH_URL: "https://anime-tier-board.vercel.app",
    }),
    false
  );
  assert.equal(
    isAllowedFeedbackOrigin("https://anime-tier-board.vercel.app", {
      AUTH_URL: "https://anime-tier-board.vercel.app",
    }),
    true
  );
  assert.equal(
    isAllowedFeedbackOrigin("http://localhost:3000", {}),
    true
  );
  const origins = getAllowedFeedbackOrigins({
    AUTH_URL: "https://custom.example/",
    CORS_ALLOWED_ORIGINS: "https://extra.example",
  });
  assert.equal(origins.has("https://custom.example"), true);
  assert.equal(origins.has("https://extra.example"), true);
});

test("validateFeedbackContentLength requires finite positive integer under cap", () => {
  const missing = validateFeedbackContentLength(null);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 411);
  }
  const empty = validateFeedbackContentLength("");
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.status, 411);
  }

  for (const bad of ["abc", "12.5", "-1", "0", "1e3", "+10"]) {
    const result = validateFeedbackContentLength(bad);
    assert.equal(result.ok, false, `expected reject for ${bad}`);
    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  }

  const oversize = validateFeedbackContentLength(
    String(FEEDBACK_MULTIPART_MAX_BYTES + 1)
  );
  assert.equal(oversize.ok, false);
  if (!oversize.ok) {
    assert.equal(oversize.status, 400);
    assert.match(oversize.message, /大きすぎ/);
  }

  const ok = validateFeedbackContentLength("1024");
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.size, 1024);
  }

  const atCap = validateFeedbackContentLength(String(FEEDBACK_MULTIPART_MAX_BYTES));
  assert.equal(atCap.ok, true);
});

test("parseAndValidateFeedbackFormData validates fields and honeypot", async () => {
  const ok = new FormData();
  ok.set("level", "idea");
  ok.set("body", "あ".repeat(12));
  ok.set(FEEDBACK_HONEYPOT_FIELD, "");
  const okResult = await parseAndValidateFeedbackFormData(ok);
  assert.equal(okResult.kind, "ok");
  if (okResult.kind === "ok") {
    assert.equal(okResult.value.level, "idea");
    assert.equal(okResult.value.body.length, 12);
    assert.equal(okResult.value.image, null);
  }

  const honeypot = new FormData();
  honeypot.set("level", "idea");
  honeypot.set("body", "あ".repeat(12));
  honeypot.set(FEEDBACK_HONEYPOT_FIELD, "bot-company");
  const honeyResult = await parseAndValidateFeedbackFormData(honeypot);
  assert.equal(honeyResult.kind, "honeypot");

  const badLevel = new FormData();
  badLevel.set("level", "nope");
  badLevel.set("body", "あ".repeat(12));
  const badLevelResult = await parseAndValidateFeedbackFormData(badLevel);
  assert.equal(badLevelResult.kind, "validation");

  const pii = new FormData();
  pii.set("level", "idea");
  pii.set("body", "あ".repeat(12));
  pii.set("email", "user@example.com");
  const piiResult = await parseAndValidateFeedbackFormData(pii);
  assert.equal(piiResult.kind, "validation");

  const withImage = new FormData();
  withImage.set("level", "problem");
  withImage.set("body", "画像つきのフィードバック本文です");
  withImage.set(
    "image",
    new File([jpegFixture(64)], "secret-name.JPG", { type: "image/jpeg" })
  );
  const imageResult = await parseAndValidateFeedbackFormData(withImage);
  assert.equal(imageResult.kind, "ok");
  if (imageResult.kind === "ok") {
    assert.ok(imageResult.value.image);
    // 元ファイル名は validated 結果に載せない
    assert.equal(
      Object.prototype.hasOwnProperty.call(imageResult.value.image, "name"),
      false
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(imageResult.value.image, "filename"),
      false
    );
  }
});
