import {
  ANIME_RECOGNITION_ALLOWED_MIME,
  ANIME_RECOGNITION_MAX_BYTES,
  ANIME_RECOGNITION_MAX_HEIGHT,
  ANIME_RECOGNITION_MAX_PIXELS,
  ANIME_RECOGNITION_MAX_WIDTH,
  type AnimeRecognitionImageMime,
} from "./types.ts";

const JPEG_SOI = [0xff, 0xd8];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageValidationFailure = {
  ok: false;
  code:
    | "empty"
    | "oversized"
    | "unsupported_type"
    | "magic_mismatch"
    | "dimensions_unknown"
    | "image_bomb";
  message: string;
};

export type ImageValidationSuccess = {
  ok: true;
  mime: AnimeRecognitionImageMime;
  width: number;
  height: number;
  hasExif: boolean;
  sanitizedBytes: Uint8Array;
  byteLength: number;
};

export type ImageValidationResult = ImageValidationSuccess | ImageValidationFailure;

function readU16be(bytes: Uint8Array, offset: number): number | null {
  if (offset + 1 >= bytes.length) {
    return null;
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32be(bytes: Uint8Array, offset: number): number | null {
  if (offset + 3 >= bytes.length) {
    return null;
  }
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string | null {
  if (offset + length > bytes.length) {
    return null;
  }
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function detectImageMimeFromMagic(bytes: Uint8Array): AnimeRecognitionImageMime | null {
  if (bytes.length >= 3 && bytes[0] === JPEG_SOI[0] && bytes[1] === JPEG_SOI[1] && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && PNG_SIG.every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function jpegHasExif(bytes: Uint8Array): boolean {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return false;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      return false;
    }
    const size = readU16be(bytes, offset + 2);
    if (size == null || size < 2) {
      return false;
    }
    if (marker === 0xe1 && ascii(bytes, offset + 4, 4) === "Exif") {
      return true;
    }
    offset += 2 + size;
  }
  return false;
}

function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9) {
      return null;
    }
    if (marker === 0xda) {
      return null;
    }
    const size = readU16be(bytes, offset + 2);
    if (size == null || size < 2) {
      return null;
    }
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && size >= 7) {
      const height = readU16be(bytes, offset + 5);
      const width = readU16be(bytes, offset + 7);
      if (width == null || height == null || width < 1 || height < 1) {
        return null;
      }
      return { width, height };
    }
    offset += 2 + size;
  }
  return null;
}

function stripJpegExif(bytes: Uint8Array): Uint8Array {
  const output: number[] = [bytes[0], bytes[1]];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      output.push(...bytes.subarray(offset));
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      output.push(...bytes.subarray(offset));
      break;
    }
    if (marker === 0xd9) {
      output.push(0xff, 0xd9);
      break;
    }
    const size = readU16be(bytes, offset + 2);
    if (size == null || size < 2) {
      output.push(...bytes.subarray(offset));
      break;
    }
    const skipExif = marker === 0xe1 && ascii(bytes, offset + 4, 4) === "Exif";
    if (!skipExif) {
      output.push(...bytes.subarray(offset, offset + 2 + size));
    }
    offset += 2 + size;
  }
  return Uint8Array.from(output);
}

function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (ascii(bytes, 12, 4) !== "IHDR") {
    return null;
  }
  const width = readU32be(bytes, 16);
  const height = readU32be(bytes, 20);
  if (width == null || height == null || width < 1 || height < 1) {
    return null;
  }
  return { width, height };
}

function pngHasExif(bytes: Uint8Array): boolean {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readU32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (length == null || type == null) {
      return false;
    }
    if (type === "eXIf" || type === "EXIf") {
      return true;
    }
    if (type === "IEND") {
      return false;
    }
    offset += 12 + length;
  }
  return false;
}

function stripPngExif(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readU32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (length == null || type == null) {
      chunks.push(bytes.subarray(offset));
      break;
    }
    const end = offset + 12 + length;
    if (end > bytes.length) {
      chunks.push(bytes.subarray(offset));
      break;
    }
    if (type !== "eXIf" && type !== "EXIf") {
      chunks.push(bytes.subarray(offset, end));
    }
    if (type === "IEND") {
      break;
    }
    offset = end;
  }
  return concat(chunks);
}

function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = bytes[offset + 4] + (bytes[offset + 5] << 8) + (bytes[offset + 6] << 16) + (bytes[offset + 7] << 24);
    if (type == null || size < 0) {
      return null;
    }
    const dataStart = offset + 8;
    if (type === "VP8X" && dataStart + 10 <= bytes.length) {
      const width =
        1 +
        bytes[dataStart + 4] +
        (bytes[dataStart + 5] << 8) +
        (bytes[dataStart + 6] << 16);
      const height =
        1 +
        bytes[dataStart + 7] +
        (bytes[dataStart + 8] << 8) +
        (bytes[dataStart + 9] << 16);
      if (width < 1 || height < 1) {
        return null;
      }
      return { width, height };
    }
    if (type === "VP8 " && dataStart + 10 <= bytes.length) {
      const width = (bytes[dataStart + 6] | (bytes[dataStart + 7] << 8)) & 0x3fff;
      const height = (bytes[dataStart + 8] | (bytes[dataStart + 9] << 8)) & 0x3fff;
      if (width < 1 || height < 1) {
        return null;
      }
      return { width, height };
    }
    if (type === "VP8L" && dataStart + 5 <= bytes.length) {
      const bits =
        bytes[dataStart + 1] |
        (bytes[dataStart + 2] << 8) |
        (bytes[dataStart + 3] << 16) |
        (bytes[dataStart + 4] << 24);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { width, height };
    }
    offset = dataStart + size + (size % 2);
  }
  return null;
}

function webpHasExif(bytes: Uint8Array): boolean {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = bytes[offset + 4] + (bytes[offset + 5] << 8) + (bytes[offset + 6] << 16) + (bytes[offset + 7] << 24);
    if (type === "EXIF") {
      return true;
    }
    if (type == null || size < 0) {
      return false;
    }
    offset += 8 + size + (size % 2);
  }
  return false;
}

function stripWebpExif(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [bytes.subarray(0, 12)];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = bytes[offset + 4] + (bytes[offset + 5] << 8) + (bytes[offset + 6] << 16) + (bytes[offset + 7] << 24);
    if (type == null || size < 0) {
      kept.push(bytes.subarray(offset));
      break;
    }
    const end = offset + 8 + size + (size % 2);
    if (type !== "EXIF") {
      kept.push(bytes.subarray(offset, Math.min(end, bytes.length)));
    }
    offset = end;
  }
  const body = concat(kept);
  const fileSize = body.length - 8;
  body[4] = fileSize & 0xff;
  body[5] = (fileSize >> 8) & 0xff;
  body[6] = (fileSize >> 16) & 0xff;
  body[7] = (fileSize >> 24) & 0xff;
  return body;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function fail(
  code: ImageValidationFailure["code"],
  message: string,
): ImageValidationFailure {
  return { ok: false, code, message };
}

export function validateRecognitionImage(
  bytes: Uint8Array,
  declaredMime?: string,
): ImageValidationResult {
  if (!bytes || bytes.byteLength === 0) {
    return fail("empty", "image bytes are empty");
  }
  if (bytes.byteLength > ANIME_RECOGNITION_MAX_BYTES) {
    return fail("oversized", "image exceeds 2 MiB limit");
  }
  const mime = detectImageMimeFromMagic(bytes);
  if (!mime) {
    return fail("unsupported_type", "magic bytes are not jpeg/png/webp");
  }
  if (
    declaredMime &&
    declaredMime !== mime &&
    !(ANIME_RECOGNITION_ALLOWED_MIME as readonly string[]).includes(declaredMime)
  ) {
    return fail("magic_mismatch", "declared MIME is not an allowed image type");
  }
  if (declaredMime && declaredMime !== mime) {
    return fail("magic_mismatch", "declared MIME does not match magic bytes");
  }

  let dimensions: { width: number; height: number } | null = null;
  let hasExif = false;
  let sanitizedBytes = bytes;
  if (mime === "image/jpeg") {
    dimensions = parseJpegDimensions(bytes);
    hasExif = jpegHasExif(bytes);
    sanitizedBytes = hasExif ? stripJpegExif(bytes) : bytes;
  } else if (mime === "image/png") {
    dimensions = parsePngDimensions(bytes);
    hasExif = pngHasExif(bytes);
    sanitizedBytes = hasExif ? stripPngExif(bytes) : bytes;
  } else {
    dimensions = parseWebpDimensions(bytes);
    hasExif = webpHasExif(bytes);
    sanitizedBytes = hasExif ? stripWebpExif(bytes) : bytes;
  }

  if (!dimensions) {
    return fail("dimensions_unknown", "image dimensions could not be parsed");
  }
  const pixels = dimensions.width * dimensions.height;
  if (
    dimensions.width > ANIME_RECOGNITION_MAX_WIDTH ||
    dimensions.height > ANIME_RECOGNITION_MAX_HEIGHT ||
    pixels > ANIME_RECOGNITION_MAX_PIXELS
  ) {
    return fail("image_bomb", "declared pixel dimensions exceed safety limits");
  }

  return {
    ok: true,
    mime,
    width: dimensions.width,
    height: dimensions.height,
    hasExif,
    sanitizedBytes,
    byteLength: sanitizedBytes.byteLength,
  };
}

export function buildJpegFixture(options: {
  width: number;
  height: number;
  withExif?: boolean;
}): Uint8Array {
  const { width, height, withExif = false } = options;
  const parts: number[] = [0xff, 0xd8];
  const jfif = [
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00,
  ];
  parts.push(...jfif);
  if (withExif) {
    const exifBody = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00];
    const size = exifBody.length + 2;
    parts.push(0xff, 0xe1, (size >> 8) & 0xff, size & 0xff, ...exifBody);
  }
  parts.push(
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x00,
    0xff,
    0xd9,
  );
  return Uint8Array.from(parts);
}

export function buildPngFixture(options: { width: number; height: number }): Uint8Array {
  const { width, height } = options;
  const ihdr = new Uint8Array([
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const iend = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return concat([Uint8Array.from(PNG_SIG), ihdr, iend]);
}

export function buildWebpFixture(options: { width: number; height: number }): Uint8Array {
  const { width, height } = options;
  const canvasW = width - 1;
  const canvasH = height - 1;
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes[4] = 22;
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  bytes[16] = 10;
  bytes[24] = canvasW & 0xff;
  bytes[25] = (canvasW >> 8) & 0xff;
  bytes[26] = (canvasW >> 16) & 0xff;
  bytes[27] = canvasH & 0xff;
  bytes[28] = (canvasH >> 8) & 0xff;
  bytes[29] = (canvasH >> 16) & 0xff;
  return bytes;
}
