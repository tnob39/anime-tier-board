/** Decode-前に適用する browser write JSON の最大バイト長（4 KiB）。 */
export const WRITE_JSON_MAX_BYTES = 4096;

export const WRITE_REQUEST_TOO_LARGE = "リクエストが大きすぎます。";
export const WRITE_REQUEST_MALFORMED = "リクエストの形式が不正です。";
export const WRITE_ORIGIN_FORBIDDEN =
  "この送信元からのリクエストは許可されていません。";

export type ReadJsonSuccess<T> = { ok: true; data: T };
export type ReadJsonFailure = { ok: false; response: Response };
export type ReadJsonResult<T> = ReadJsonSuccess<T> | ReadJsonFailure;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function isChunkedTransfer(headers: Headers): boolean {
  const te = headers.get("transfer-encoding");
  if (te == null || te.trim() === "") return false;
  return te
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes("chunked");
}

/**
 * Content-Length を厳密に解釈する。
 * - 欠落 / 空白のみ → missing
 * - 負・非整数・非数字・非安全整数 → invalid
 * - それ以外 → 非負整数
 */
function parseContentLengthHeader(
  header: string | null
): "missing" | "invalid" | number {
  if (header == null) return "missing";
  const raw = header.trim();
  if (raw === "") return "missing";
  if (!/^\d+$/.test(raw)) return "invalid";
  const size = Number(raw);
  if (!Number.isSafeInteger(size) || size < 0) return "invalid";
  return size;
}

function collectOriginHeaderValues(headers: Headers): string[] {
  const values: string[] = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "origin") {
      values.push(value);
    }
  });
  return values;
}

/**
 * Browser write の same-origin 検査。
 * Origin 必須・request.url.origin 完全一致のみ許可。
 * 失敗時は 403。成功時は null。
 */
export function assertSameOriginBrowserWrite(
  request: Request
): Response | null {
  const forbidden = () => jsonError(WRITE_ORIGIN_FORBIDDEN, 403);

  const originValues = collectOriginHeaderValues(request.headers);
  if (originValues.length === 0) return forbidden();
  if (originValues.length > 1) return forbidden();

  const originHeader = originValues[0];
  if (
    originHeader == null ||
    originHeader === "" ||
    originHeader === "null" ||
    originHeader.includes(",")
  ) {
    return forbidden();
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return forbidden();
  }

  let headerOrigin: string;
  try {
    const parsed = new URL(originHeader);
    headerOrigin = parsed.origin;
    // Origin ヘッダは origin そのもののみ（path/query/余分な文字を拒否）
    if (headerOrigin !== originHeader) return forbidden();
  } catch {
    return forbidden();
  }

  if (headerOrigin !== requestOrigin) return forbidden();
  return null;
}

async function readBodyBytesWithLimit(
  request: Request,
  maxBytes: number
): Promise<ReadJsonResult<Uint8Array>> {
  const headers = request.headers;
  const chunked = isChunkedTransfer(headers);
  const contentLength = parseContentLengthHeader(
    headers.get("content-length")
  );

  if (contentLength === "invalid") {
    return { ok: false, response: jsonError(WRITE_REQUEST_MALFORMED, 400) };
  }

  // 宣言サイズが上限超過なら body を一切読まずに 413（pull 0）
  if (!chunked && typeof contentLength === "number" && contentLength > maxBytes) {
    return { ok: false, response: jsonError(WRITE_REQUEST_TOO_LARGE, 413) };
  }

  const body = request.body;
  if (body == null) {
    return { ok: true, data: new Uint8Array(0) };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value == null || value.byteLength === 0) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // oversize 確定後は cancel 失敗を握り、413 を維持する
        }
        return { ok: false, response: jsonError(WRITE_REQUEST_TOO_LARGE, 413) };
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // fail-closed: 読取失敗は拒否
    }
    return { ok: false, response: jsonError(WRITE_REQUEST_MALFORMED, 400) };
  }

  if (chunks.length === 0) {
    return { ok: true, data: new Uint8Array(0) };
  }
  if (chunks.length === 1) {
    return { ok: true, data: chunks[0] };
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, data: merged };
}

/**
 * request.json/text/arrayBuffer を使わず、byte 上限付きで JSON を decode する。
 * - Content-Length 不正/負/非整数 → 400
 * - Content-Length 超過（非 chunked）→ 413・body 未読
 * - 欠落 / chunked → reader で累積し超過時 cancel → 413
 * - UTF-8 fatal・JSON 不正・空 → 400
 */
export async function readJsonWithByteLimit<T>(
  request: Request,
  maxBytes: number = WRITE_JSON_MAX_BYTES
): Promise<ReadJsonResult<T>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    return { ok: false, response: jsonError(WRITE_REQUEST_MALFORMED, 400) };
  }

  const bodyResult = await readBodyBytesWithLimit(request, maxBytes);
  if (!bodyResult.ok) return bodyResult;

  const bytes = bodyResult.data;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, response: jsonError(WRITE_REQUEST_MALFORMED, 400) };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, response: jsonError(WRITE_REQUEST_MALFORMED, 400) };
  }
}

export type CommentWriteBodySuccess = { ok: true; body: string };
export type CommentWriteBodyFailure = { ok: false; response: Response };
export type CommentWriteBodyResult =
  | CommentWriteBodySuccess
  | CommentWriteBodyFailure;

/**
 * comments POST 用: decode 後・trim 前の形状検証。
 * 非 null object かつ body が string のみ許可。それ以外は日本語 400。
 */
export function parseCommentWriteBody(data: unknown): CommentWriteBodyResult {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, response: jsonError(WRITE_REQUEST_MALFORMED, 400) };
  }

  const body = (data as { body?: unknown }).body;
  if (typeof body !== "string") {
    return { ok: false, response: jsonError(WRITE_REQUEST_MALFORMED, 400) };
  }

  return { ok: true, body };
}
