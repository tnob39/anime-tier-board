import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { GET } from "../app/api/image-proxy/route.ts";

const sourceUrl = "https://images.example.test/large.png";

async function withImageFetch<T>(body: Buffer, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(body, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(body.byteLength) }
  });
  try { return await run(); }
  finally { globalThis.fetch = originalFetch; }
}

test("image proxy emits a smaller bounded WebP variant", async () => {
  const original = await sharp({ create: { width: 1200, height: 1700, channels: 3, background: "#7a4f2b" } })
    .png().toBuffer();
  await withImageFetch(original, async () => {
    const response = await GET(new Request(`https://app.test/api/image-proxy?url=${encodeURIComponent(sourceUrl)}&w=96`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    const output = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, 96);
    assert.ok(output.byteLength < original.byteLength);
    assert.equal(Number(response.headers.get("content-length")), output.byteLength);
    assert.match(response.headers.get("cache-control") ?? "", /stale-while-revalidate/);
  });
});

test("image proxy rejects unbounded widths before upstream fetch", async () => {
  let fetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetches += 1; return new Response(); };
  try {
    const response = await GET(new Request(`https://app.test/api/image-proxy?url=${encodeURIComponent(sourceUrl)}&w=4096`));
    assert.equal(response.status, 400);
    assert.equal(fetches, 0);
  } finally { globalThis.fetch = originalFetch; }
});
