import { createHash } from "node:crypto";
import type { RecognitionInput, RecognitionResult } from "./types.ts";

const FORBIDDEN_LOG_KEYS = new Set([
  "bytes",
  "raw",
  "rawBytes",
  "imageBytes",
  "image",
  "buffer",
  "base64",
  "dataUrl",
  "dataURL",
  "fileBytes",
  "payload",
]);

export type SafeInputDescriptor = {
  kind: "binary" | "fixture";
  fixtureId?: string;
  declaredMime?: string;
  byteLength?: number;
  sha256Hex?: string;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function describeInputSafely(input: RecognitionInput): SafeInputDescriptor {
  if (input.kind === "fixture") {
    return { kind: "fixture", fixtureId: input.fixtureId };
  }
  return {
    kind: "binary",
    declaredMime: input.declaredMime,
    byteLength: input.bytes.byteLength,
    sha256Hex: sha256Hex(input.bytes),
  };
}

export function sanitizeRecognitionLog(value: unknown): unknown {
  return sanitizeNode(value, 0);
}

function sanitizeNode(value: unknown, depth: number): unknown {
  if (depth > 8) {
    return "[truncated]";
  }
  if (value instanceof Uint8Array || Buffer.isBuffer(value) || value instanceof ArrayBuffer) {
    return undefined;
  }
  if (typeof value === "string") {
    if (/^data:image\//i.test(value)) {
      return "[redacted-data-url]";
    }
    if (value.length > 128 && /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length % 4 === 0) {
      return "[redacted-base64]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNode(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_LOG_KEYS.has(key)) {
        continue;
      }
      const cleaned = sanitizeNode(nested, depth + 1);
      if (cleaned !== undefined) {
        output[key] = cleaned;
      }
    }
    return output;
  }
  return value;
}

export function recognitionResultForLog(result: RecognitionResult): unknown {
  return sanitizeRecognitionLog(result);
}

export function jsonContainsRawImage(value: unknown): boolean {
  if (value instanceof Uint8Array || Buffer.isBuffer(value) || value instanceof ArrayBuffer) {
    return true;
  }
  if (typeof value === "string") {
    return /^data:image\//i.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => jsonContainsRawImage(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => {
      if (FORBIDDEN_LOG_KEYS.has(key)) {
        return true;
      }
      return jsonContainsRawImage(nested);
    });
  }
  return false;
}
