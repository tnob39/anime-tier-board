import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WRITE_JSON_MAX_BYTES,
  WRITE_ORIGIN_FORBIDDEN,
  WRITE_REQUEST_MALFORMED,
  WRITE_REQUEST_TOO_LARGE,
  assertSameOriginBrowserWrite,
  parseCommentWriteBody,
  parseReactionWriteBody,
  readFormDataWithByteLimit,
  readJsonWithByteLimit,
} from "../lib/api/write-request-guard.ts";

const SAME_ORIGIN_URL = "https://anime-tier-board.vercel.app/api/shares/s1/comments";
const SAME_ORIGIN = "https://anime-tier-board.vercel.app";

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function jsonBodyOfExactBytes(targetBytes: number): Uint8Array {
  const prefix = '{"body":"';
  const suffix = '"}';
  const overhead = encodeUtf8(prefix + suffix).byteLength;
  assert.ok(targetBytes >= overhead, "targetBytes too small for JSON envelope");
  const pad = "a".repeat(targetBytes - overhead);
  const bytes = encodeUtf8(prefix + pad + suffix);
  assert.equal(bytes.byteLength, targetBytes);
  return bytes;
}

function requestFromBytes(
  bytes: Uint8Array,
  init: {
    url?: string;
    contentLength?: string | null;
    transferEncoding?: string;
    origin?: string | null;
    origins?: string[];
    skipContentLength?: boolean;
  } = {}
): Request {
  const headers = new Headers();
  if (init.origins) {
    for (const origin of init.origins) {
      headers.append("origin", origin);
    }
  } else if (init.origin !== undefined && init.origin !== null) {
    headers.set("origin", init.origin);
  }

  if (init.transferEncoding) {
    headers.set("transfer-encoding", init.transferEncoding);
  }

  if (!init.skipContentLength) {
    if (init.contentLength === null) {
      // omit Content-Length
    } else if (init.contentLength !== undefined) {
      headers.set("content-length", init.contentLength);
    } else {
      headers.set("content-length", String(bytes.byteLength));
    }
  }

  return new Request(init.url ?? SAME_ORIGIN_URL, {
    method: "POST",
    headers,
    body: bytes,
  });
}

function streamRequest(
  stream: ReadableStream<Uint8Array>,
  init: {
    url?: string;
    contentLength?: string | null;
    transferEncoding?: string;
    origin?: string;
    skipContentLength?: boolean;
  } = {}
): Request {
  const headers = new Headers();
  if (init.origin) headers.set("origin", init.origin);
  if (init.transferEncoding) {
    headers.set("transfer-encoding", init.transferEncoding);
  }
  if (!init.skipContentLength && init.contentLength !== null) {
    if (init.contentLength !== undefined) {
      headers.set("content-length", init.contentLength);
    }
  } else if (init.contentLength === null || init.skipContentLength) {
    // omit
  }
  return new Request(init.url ?? SAME_ORIGIN_URL, {
    method: "POST",
    headers,
    body: stream,
    // @ts-expect-error duplex required for streaming body in some runtimes
    duplex: "half",
  });
}

async function errorBody(response: Response): Promise<{ error?: string }> {
  return (await response.json()) as { error?: string };
}

test("readJsonWithByteLimit accepts max-1 and max exact UTF-8 JSON bytes", async () => {
  const maxMinus1 = jsonBodyOfExactBytes(WRITE_JSON_MAX_BYTES - 1);
  const maxExact = jsonBodyOfExactBytes(WRITE_JSON_MAX_BYTES);

  const ok1 = await readJsonWithByteLimit<{ body: string }>(
    requestFromBytes(maxMinus1)
  );
  assert.equal(ok1.ok, true);
  if (ok1.ok) {
    assert.equal(typeof ok1.data.body, "string");
    assert.equal(ok1.data.body.length, WRITE_JSON_MAX_BYTES - 1 - '{"body":"'.length - '"}'.length);
  }

  const ok2 = await readJsonWithByteLimit<{ body: string }>(
    requestFromBytes(maxExact)
  );
  assert.equal(ok2.ok, true);
  if (ok2.ok) {
    assert.equal(typeof ok2.data.body, "string");
  }
});

test("readJsonWithByteLimit rejects max+1 with 413 Japanese message", async () => {
  const over = jsonBodyOfExactBytes(WRITE_JSON_MAX_BYTES + 1);
  const result = await readJsonWithByteLimit(requestFromBytes(over));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 413);
    assert.deepEqual(await errorBody(result.response), {
      error: WRITE_REQUEST_TOO_LARGE,
    });
  }
});

test("readJsonWithByteLimit accepts Japanese and emoji payloads by byteLength", async () => {
  const japanese = encodeUtf8(JSON.stringify({ body: "こんにちはコメント" }));
  const emoji = encodeUtf8(JSON.stringify({ body: " indアニメ😀🔥" }));
  assert.ok(japanese.byteLength > "こんにちはコメント".length);
  assert.ok(emoji.byteLength > 10);
  assert.ok(japanese.byteLength <= WRITE_JSON_MAX_BYTES);
  assert.ok(emoji.byteLength <= WRITE_JSON_MAX_BYTES);

  const j = await readJsonWithByteLimit<{ body: string }>(
    requestFromBytes(japanese)
  );
  assert.equal(j.ok, true);
  if (j.ok) assert.equal(j.data.body, "こんにちはコメント");

  const e = await readJsonWithByteLimit<{ body: string }>(
    requestFromBytes(emoji)
  );
  assert.equal(e.ok, true);
  if (e.ok) assert.equal(e.data.body, " indアニメ😀🔥");
});

test("forged small Content-Length still enforces streaming byte cap", async () => {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(jsonBodyOfExactBytes(100));
        return;
      }
      // attacker continues past forged length
      controller.enqueue(new Uint8Array(WRITE_JSON_MAX_BYTES));
      controller.close();
    },
  });

  const result = await readJsonWithByteLimit(
    streamRequest(stream, {
      contentLength: "100",
      origin: SAME_ORIGIN,
    })
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 413);
    assert.deepEqual(await errorBody(result.response), {
      error: WRITE_REQUEST_TOO_LARGE,
    });
  }
  assert.ok(pulls >= 2);
});

test("oversize Content-Length rejects with pull count 0", async () => {
  let pulls = 0;
  const headers = new Headers();
  headers.set("content-length", String(WRITE_JSON_MAX_BYTES + 1));
  headers.set("origin", SAME_ORIGIN);

  // Request 実装の内部消費を避け、getReader 呼び出し回数だけで pull を計測する
  const request = {
    url: SAME_ORIGIN_URL,
    headers,
    body: {
      getReader() {
        pulls += 1;
        return {
          async read() {
            return { done: true as const, value: undefined };
          },
          async cancel() {},
        };
      },
    },
  } as unknown as Request;

  const result = await readJsonWithByteLimit(request);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 413);
    assert.deepEqual(await errorBody(result.response), {
      error: WRITE_REQUEST_TOO_LARGE,
    });
  }
  assert.equal(pulls, 0);
});

test("chunked / missing Content-Length accumulates and cancels on oversize", async () => {
  let cancelled = false;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(new Uint8Array(WRITE_JSON_MAX_BYTES));
        return;
      }
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });

  const result = await readJsonWithByteLimit(
    streamRequest(stream, {
      contentLength: null,
      transferEncoding: "chunked",
      origin: SAME_ORIGIN,
      skipContentLength: true,
    })
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 413);
    assert.deepEqual(await errorBody(result.response), {
      error: WRITE_REQUEST_TOO_LARGE,
    });
  }
  assert.equal(cancelled, true);
  assert.ok(pulls >= 2);
});

test("oversize keeps 413 when reader.cancel throws", async () => {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(new Uint8Array(WRITE_JSON_MAX_BYTES));
        return;
      }
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      throw new Error("cancel failed");
    },
  });

  const result = await readJsonWithByteLimit(
    streamRequest(stream, {
      contentLength: null,
      transferEncoding: "chunked",
      origin: SAME_ORIGIN,
      skipContentLength: true,
    })
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 413);
    assert.deepEqual(await errorBody(result.response), {
      error: WRITE_REQUEST_TOO_LARGE,
    });
  }
});

test("malformed JSON / invalid UTF-8 / empty body return 400", async () => {
  const malformed = await readJsonWithByteLimit(
    requestFromBytes(encodeUtf8('{"body":'))
  );
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.response.status, 400);
    assert.deepEqual(await errorBody(malformed.response), {
      error: WRITE_REQUEST_MALFORMED,
    });
  }

  const badUtf8 = await readJsonWithByteLimit(
    requestFromBytes(new Uint8Array([0xe3, 0x81])) // truncated UTF-8
  );
  assert.equal(badUtf8.ok, false);
  if (!badUtf8.ok) {
    assert.equal(badUtf8.response.status, 400);
    assert.deepEqual(await errorBody(badUtf8.response), {
      error: WRITE_REQUEST_MALFORMED,
    });
  }

  const empty = await readJsonWithByteLimit(
    requestFromBytes(new Uint8Array(0), { contentLength: "0" })
  );
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.response.status, 400);
    assert.deepEqual(await errorBody(empty.response), {
      error: WRITE_REQUEST_MALFORMED,
    });
  }
});

test("invalid Content-Length values are rejected as malformed", async () => {
  const cases = ["-1", "1.5", "1e3", "+10", "abc", "0x10", "1 2"];
  for (const contentLength of cases) {
    const result = await readJsonWithByteLimit(
      requestFromBytes(encodeUtf8('{"body":"ok"}'), { contentLength })
    );
    assert.equal(result.ok, false, `expected reject for CL=${contentLength}`);
    if (!result.ok) {
      assert.equal(result.response.status, 400);
      assert.deepEqual(await errorBody(result.response), {
        error: WRITE_REQUEST_MALFORMED,
      });
    }
  }
});

test("assertSameOriginBrowserWrite origin matrix", () => {
  const allow = assertSameOriginBrowserWrite(
    new Request(SAME_ORIGIN_URL, {
      method: "POST",
      headers: { origin: SAME_ORIGIN },
    })
  );
  assert.equal(allow, null);

  const missing = assertSameOriginBrowserWrite(
    new Request(SAME_ORIGIN_URL, { method: "POST" })
  );
  assert.ok(missing);
  assert.equal(missing!.status, 403);

  const nullOrigin = assertSameOriginBrowserWrite(
    new Request(SAME_ORIGIN_URL, {
      method: "POST",
      headers: { origin: "null" },
    })
  );
  assert.ok(nullOrigin);
  assert.equal(nullOrigin!.status, 403);

  const multiple = assertSameOriginBrowserWrite(
    requestFromBytes(encodeUtf8("{}"), {
      origins: [SAME_ORIGIN, "https://evil.example"],
      skipContentLength: true,
      contentLength: null,
    })
  );
  assert.ok(multiple);
  assert.equal(multiple!.status, 403);

  const malformed = assertSameOriginBrowserWrite(
    new Request(SAME_ORIGIN_URL, {
      method: "POST",
      headers: { origin: "not-a-valid-origin" },
    })
  );
  assert.ok(malformed);
  assert.equal(malformed!.status, 403);

  const withPath = assertSameOriginBrowserWrite(
    new Request(SAME_ORIGIN_URL, {
      method: "POST",
      headers: { origin: `${SAME_ORIGIN}/extra` },
    })
  );
  assert.ok(withPath);
  assert.equal(withPath!.status, 403);

  const cross = assertSameOriginBrowserWrite(
    new Request(SAME_ORIGIN_URL, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    })
  );
  assert.ok(cross);
  assert.equal(cross!.status, 403);

  for (const response of [missing, nullOrigin, multiple, malformed, withPath, cross]) {
    assert.ok(response);
  }
});

test("assertSameOriginBrowserWrite 403 message is Japanese fail-closed", async () => {
  const denied = assertSameOriginBrowserWrite(
    new Request(SAME_ORIGIN_URL, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    })
  );
  assert.ok(denied);
  assert.deepEqual(await errorBody(denied!), { error: WRITE_ORIGIN_FORBIDDEN });
});

test("read error fails closed without accepting body", async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull() {
      throw new Error("simulated read failure");
    },
  });

  const result = await readJsonWithByteLimit(
    streamRequest(stream, {
      contentLength: null,
      skipContentLength: true,
      origin: SAME_ORIGIN,
    })
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 400);
    assert.deepEqual(await errorBody(result.response), {
      error: WRITE_REQUEST_MALFORMED,
    });
  }
});

test("parallel calls remain isolated and stateless", async () => {
  const tasks = Array.from({ length: 20 }, async (_, i) => {
    if (i % 2 === 0) {
      const denied = assertSameOriginBrowserWrite(
        new Request(SAME_ORIGIN_URL, {
          method: "POST",
          headers: { origin: "https://evil.example" },
        })
      );
      assert.ok(denied);
      assert.equal(denied!.status, 403);
      return "denied";
    }

    const payload = encodeUtf8(JSON.stringify({ body: `ok-${i}` }));
    const result = await readJsonWithByteLimit<{ body: string }>(
      requestFromBytes(payload, { origin: SAME_ORIGIN })
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.body, `ok-${i}`);
    return "ok";
  });

  const outcomes = await Promise.all(tasks);
  assert.equal(outcomes.filter((v) => v === "ok").length, 10);
  assert.equal(outcomes.filter((v) => v === "denied").length, 10);
});

test("parseCommentWriteBody rejects null/array/non-string body with Japanese 400", async () => {
  const cases: unknown[] = [
    null,
    [],
    ["body"],
    { body: 1 },
    { body: { text: "x" } },
    { body: true },
    {},
    { body: null },
    { body: undefined },
  ];

  for (const data of cases) {
    const result = parseCommentWriteBody(data);
    assert.equal(result.ok, false, `expected reject for ${JSON.stringify(data)}`);
    if (!result.ok) {
      assert.equal(result.response.status, 400);
      assert.notEqual(result.response.status, 500);
      assert.deepEqual(await errorBody(result.response), {
        error: WRITE_REQUEST_MALFORMED,
      });
    }
  }

  const ok = parseCommentWriteBody({ body: "  hello  " });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.body, "  hello  ");
});

test("parseReactionWriteBody rejects non-string kind with Japanese 400", async () => {
  const cases: unknown[] = [null, [], { kind: 1 }, { kind: null }, {}];
  for (const data of cases) {
    const result = parseReactionWriteBody(data);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 400);
      assert.deepEqual(await errorBody(result.response), {
        error: WRITE_REQUEST_MALFORMED,
      });
    }
  }
  const ok = parseReactionWriteBody({ kind: "like" });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.kind, "like");
});

test("source contract: comments POST wires auth→origin→shareId→guard decode→body shape", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const routePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../app/api/shares/[shareId]/comments/route.ts"
  );
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /assertSameOriginBrowserWrite/);
  assert.match(source, /readJsonWithByteLimit/);
  assert.match(source, /parseCommentWriteBody/);
  assert.doesNotMatch(source, /await\s+request\.json\s*\(/);
  assert.doesNotMatch(source, /request\.text\s*\(/);
  assert.doesNotMatch(source, /request\.arrayBuffer\s*\(/);
  assert.doesNotMatch(source, /parsed\.data\.body\?\.trim\(/);

  const authIdx = source.indexOf("await auth()");
  const originIdx = source.indexOf("assertSameOriginBrowserWrite(request)");
  const shareIdIdx = source.indexOf("const { shareId } = await params");
  const postShareIdIdx = source.indexOf(
    "const { shareId } = await params",
    shareIdIdx + 1
  );
  const decodeIdx = source.indexOf("await readJsonWithByteLimit");
  const shapeIdx = source.indexOf("parseCommentWriteBody(parsed.data)");
  const trimIdx = source.indexOf("commentBody.body.trim()");
  assert.ok(authIdx >= 0 && originIdx > authIdx);
  assert.ok(postShareIdIdx > originIdx);
  assert.ok(decodeIdx > postShareIdIdx);
  assert.ok(shapeIdx > decodeIdx);
  assert.ok(trimIdx > shapeIdx);

  assert.match(source, /consumeWriteRateLimit/);
  const rateIdx = source.indexOf('policy: "comment"');
  assert.ok(rateIdx > originIdx);
  assert.ok(decodeIdx > rateIdx);
  assert.match(source, /export async function DELETE/);
  assert.match(source, /delete from share_comments/);
});

function multipartPayload(
  value: string,
  boundary = "----atbTestBoundary"
): { bytes: Uint8Array; contentType: string } {
  const raw =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="level"\r\n\r\n` +
    `${value}\r\n` +
    `--${boundary}--\r\n`;
  return {
    bytes: encodeUtf8(raw),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

test("readFormDataWithByteLimit reconstructs multipart and preserves fields", async () => {
  const { bytes, contentType } = multipartPayload("idea");
  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("content-length", String(bytes.byteLength));
  const request = new Request(SAME_ORIGIN_URL, {
    method: "POST",
    headers,
    body: bytes,
  });
  const result = await readFormDataWithByteLimit(request, 4096);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.formData.get("level"), "idea");
  }
});

test("readFormDataWithByteLimit missing Content-Length still caps and 413s", async () => {
  const maxBytes = 64;
  let cancelled = false;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(new Uint8Array(maxBytes));
        return;
      }
      controller.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });
  const headers = new Headers();
  headers.set("content-type", "multipart/form-data; boundary=----x");
  headers.set("transfer-encoding", "chunked");
  const request = new Request(SAME_ORIGIN_URL, {
    method: "POST",
    headers,
    body: stream,
    // @ts-expect-error duplex required for streaming body in some runtimes
    duplex: "half",
  });
  const result = await readFormDataWithByteLimit(request, maxBytes);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 413);
    assert.deepEqual(await errorBody(result.response), {
      error: WRITE_REQUEST_TOO_LARGE,
    });
  }
  assert.equal(cancelled, true);
});

test("readFormDataWithByteLimit forged small Content-Length still caps streaming body", async () => {
  const maxBytes = 32;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(new Uint8Array(16));
        return;
      }
      controller.enqueue(new Uint8Array(maxBytes));
      controller.close();
    },
  });
  const headers = new Headers();
  headers.set("content-type", "multipart/form-data; boundary=----x");
  headers.set("content-length", "16");
  const request = new Request(SAME_ORIGIN_URL, {
    method: "POST",
    headers,
    body: stream,
    // @ts-expect-error duplex required for streaming body in some runtimes
    duplex: "half",
  });
  const result = await readFormDataWithByteLimit(request, maxBytes);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 413);
  }
  assert.ok(pulls >= 2);
});
