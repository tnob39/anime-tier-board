import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  computeFeedbackImageTargetSize,
  formatFeedbackImageBytes,
  prepareFeedbackImageForUpload,
  type FeedbackImageCompressCodec,
} from "../lib/feedback-image-compress.ts";
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_SELECT_MAX_BYTES,
} from "../lib/feedback-shared.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeFile(
  byteLength: number,
  type: string,
  name = "shot.png"
): File {
  const bytes = new Uint8Array(byteLength);
  return new File([bytes], name, { type, lastModified: 1 });
}

function makeCodec(options: {
  width?: number;
  height?: number;
  /** 呼び出し順に返すサイズ。尽きたら最後の値を繰り返す。 */
  encodeSizes: number[];
  failDecode?: boolean;
  failEncode?: boolean;
}): FeedbackImageCompressCodec & { encodeCalls: Array<{ width: number; height: number; quality: number }> } {
  const encodeCalls: Array<{ width: number; height: number; quality: number }> = [];
  let encodeIndex = 0;
  return {
    encodeCalls,
    async decode() {
      if (options.failDecode) {
        throw new Error("decode boom");
      }
      return {
        width: options.width ?? 4000,
        height: options.height ?? 3000,
      };
    },
    async encode({ width, height, quality }) {
      if (options.failEncode) {
        throw new Error("encode boom");
      }
      encodeCalls.push({ width, height, quality });
      const size =
        options.encodeSizes[
          Math.min(encodeIndex, options.encodeSizes.length - 1)
        ] ?? FEEDBACK_IMAGE_MAX_BYTES;
      encodeIndex += 1;
      return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
    },
  };
}

test("formatFeedbackImageBytes formats B/KB/MB", () => {
  assert.equal(formatFeedbackImageBytes(512), "512B");
  assert.equal(formatFeedbackImageBytes(2048), "2KB");
  assert.equal(formatFeedbackImageBytes(1536), "1.5KB");
  assert.equal(formatFeedbackImageBytes(3 * 1024 * 1024), "3MB");
  assert.equal(formatFeedbackImageBytes(3.2 * 1024 * 1024), "3.2MB");
});

test("computeFeedbackImageTargetSize keeps aspect and respects long edge", () => {
  assert.deepEqual(computeFeedbackImageTargetSize(1000, 800, 2000), {
    width: 1000,
    height: 800,
  });
  assert.deepEqual(computeFeedbackImageTargetSize(4000, 3000, 2000), {
    width: 2000,
    height: 1500,
  });
  assert.deepEqual(computeFeedbackImageTargetSize(3000, 4000, 1000), {
    width: 750,
    height: 1000,
  });
});

test("prepareFeedbackImageForUpload rejects unsupported mime and oversize select", async () => {
  const gif = await prepareFeedbackImageForUpload(
    makeFile(1000, "image/gif", "a.gif")
  );
  assert.equal(gif.ok, false);
  if (!gif.ok) {
    assert.match(gif.error, /JPEG \/ PNG \/ WebP/);
  }

  const huge = await prepareFeedbackImageForUpload(
    makeFile(FEEDBACK_IMAGE_SELECT_MAX_BYTES + 1, "image/jpeg")
  );
  assert.equal(huge.ok, false);
  if (!huge.ok) {
    assert.match(huge.error, /20MB|以下/);
  }
});

test("prepareFeedbackImageForUpload skips recompress at or under upload max", async () => {
  const codec = makeCodec({ encodeSizes: [1] });
  const file = makeFile(FEEDBACK_IMAGE_MAX_BYTES, "image/png");
  const result = await prepareFeedbackImageForUpload(file, { codec });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.compressed, false);
    assert.equal(result.file, file);
    assert.equal(result.outputBytes, FEEDBACK_IMAGE_MAX_BYTES);
  }
  assert.equal(codec.encodeCalls.length, 0);
});

test("prepareFeedbackImageForUpload compresses oversize with stepped encode", async () => {
  const codec = makeCodec({
    width: 4000,
    height: 3000,
    encodeSizes: [
      FEEDBACK_IMAGE_MAX_BYTES + 500_000,
      FEEDBACK_IMAGE_MAX_BYTES + 100_000,
      FEEDBACK_IMAGE_MAX_BYTES - 10_000,
    ],
  });
  const file = makeFile(FEEDBACK_IMAGE_MAX_BYTES + 2_000_000, "image/png");
  const result = await prepareFeedbackImageForUpload(file, {
    codec,
    longEdgeSteps: [2000, 1000],
    qualitySteps: [0.9, 0.7, 0.5],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.compressed, true);
    assert.ok(result.outputBytes < FEEDBACK_IMAGE_MAX_BYTES);
    assert.equal(result.originalBytes, file.size);
    assert.equal(result.file.type, "image/jpeg");
    assert.notEqual(result.file, file);
  }
  assert.equal(codec.encodeCalls.length, 3);
  assert.equal(codec.encodeCalls[0]?.width, 2000);
  assert.equal(codec.encodeCalls[0]?.height, 1500);
  assert.equal(codec.encodeCalls[0]?.quality, 0.9);
  assert.equal(codec.encodeCalls[2]?.quality, 0.5);
});

test("prepareFeedbackImageForUpload reports decode/encode and fit failures", async () => {
  const decodeFail = await prepareFeedbackImageForUpload(
    makeFile(FEEDBACK_IMAGE_MAX_BYTES + 1, "image/jpeg"),
    { codec: makeCodec({ encodeSizes: [1], failDecode: true }) }
  );
  assert.equal(decodeFail.ok, false);
  if (!decodeFail.ok) {
    assert.match(decodeFail.error, /読み込み/);
  }

  const encodeFail = await prepareFeedbackImageForUpload(
    makeFile(FEEDBACK_IMAGE_MAX_BYTES + 1, "image/jpeg"),
    { codec: makeCodec({ encodeSizes: [1], failEncode: true }) }
  );
  assert.equal(encodeFail.ok, false);
  if (!encodeFail.ok) {
    assert.match(encodeFail.error, /圧縮/);
  }

  const neverFits = await prepareFeedbackImageForUpload(
    makeFile(FEEDBACK_IMAGE_MAX_BYTES + 1, "image/webp"),
    {
      codec: makeCodec({
        encodeSizes: [FEEDBACK_IMAGE_MAX_BYTES + 1],
      }),
      longEdgeSteps: [800],
      qualitySteps: [0.5],
    }
  );
  assert.equal(neverFits.ok, false);
  if (!neverFits.ok) {
    assert.match(neverFits.error, /規定サイズ/);
  }
});

test("client keeps image selection clear and explains submit requirements", () => {
  const ui = readFileSync(
    path.join(projectRoot, "app/feedback/feedback-client.tsx"),
    "utf8"
  );
  assert.match(ui, /FEEDBACK_IMAGE_SELECT_MAX_BYTES/);
  assert.match(ui, /自動圧縮/);
  assert.match(ui, /画像を圧縮しています/);
  assert.match(ui, /元画像は送りません/);
  assert.match(ui, /selectedImageName/);
  assert.match(ui, /画像を添付しなくても送信できます/);
  assert.match(ui, /画像を削除/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /内容をあと/);
  assert.match(ui, /公開についての確認にチェックしてください/);
  assert.doesNotMatch(
    ui,
    /const file = event\.target\.files\?\.\[0\] \?\? null;\s*event\.target\.value = ""/
  );
  assert.doesNotMatch(ui, /画像は3MB以下にしてください。/);
});
