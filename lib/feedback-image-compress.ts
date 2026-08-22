/**
 * 問い合わせフォーム向けブラウザ内画像圧縮。
 * Canvas / createImageBitmap 依存は注入可能にし、Node 上の focused test を可能にする。
 */

import {
  FEEDBACK_ALLOWED_IMAGE_MIME,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_SELECT_MAX_BYTES,
  type FeedbackImageMime,
} from "./feedback-shared.ts";

/** 長辺を段階的に下げ、過剰な一括縮小を避ける。 */
export const FEEDBACK_IMAGE_LONG_EDGE_STEPS = [
  2560, 2048, 1920, 1600, 1280, 1024, 800,
] as const;

/** JPEG/WebP 品質を段階調整（高い品質から試す）。 */
export const FEEDBACK_IMAGE_QUALITY_STEPS = [
  0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.48,
] as const;

export const FEEDBACK_IMAGE_COMPRESS_OUTPUT_MIME = "image/jpeg" as const;

export type FeedbackImageBitmapLike = {
  width: number;
  height: number;
  close?: () => void;
};

export type FeedbackImageCompressCodec = {
  decode: (blob: Blob) => Promise<FeedbackImageBitmapLike>;
  encode: (input: {
    source: FeedbackImageBitmapLike;
    width: number;
    height: number;
    mimeType: string;
    quality: number;
  }) => Promise<Blob>;
};

export type PrepareFeedbackImageSuccess = {
  ok: true;
  file: File;
  originalBytes: number;
  outputBytes: number;
  compressed: boolean;
};

export type PrepareFeedbackImageFailure = {
  ok: false;
  error: string;
};

export type PrepareFeedbackImageResult =
  | PrepareFeedbackImageSuccess
  | PrepareFeedbackImageFailure;

export type PrepareFeedbackImageOptions = {
  selectMaxBytes?: number;
  uploadMaxBytes?: number;
  longEdgeSteps?: readonly number[];
  qualitySteps?: readonly number[];
  outputMimeType?: "image/jpeg" | "image/webp";
  codec?: FeedbackImageCompressCodec;
};

export function formatFeedbackImageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0B";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)}B`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10}KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`;
}

export function isAllowedFeedbackImageMime(
  mime: string
): mime is FeedbackImageMime {
  return (FEEDBACK_ALLOWED_IMAGE_MIME as readonly string[]).includes(mime);
}

export function computeFeedbackImageTargetSize(
  width: number,
  height: number,
  maxLongEdge: number
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const longEdge = Math.max(safeWidth, safeHeight);
  if (longEdge <= maxLongEdge) {
    return { width: safeWidth, height: safeHeight };
  }
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function defaultBrowserCodec(): FeedbackImageCompressCodec {
  return {
    async decode(blob) {
      if (typeof createImageBitmap === "function") {
        return createImageBitmap(blob);
      }
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("decode failed"));
          img.src = objectUrl;
        });
        return {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
    async encode({ source, width, height, mimeType, quality }) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("canvas unavailable");
      }
      ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), mimeType, quality);
      });
      if (!blob) {
        throw new Error("encode failed");
      }
      return blob;
    },
  };
}

/**
 * 3MB以下はそのまま。超過時のみ長辺・品質を段階調整して uploadMax 未満へ圧縮する。
 * 元ファイルは返さず、圧縮成功時は出力 Blob のみを File 化する。
 */
export async function prepareFeedbackImageForUpload(
  file: File,
  options: PrepareFeedbackImageOptions = {}
): Promise<PrepareFeedbackImageResult> {
  const selectMaxBytes = options.selectMaxBytes ?? FEEDBACK_IMAGE_SELECT_MAX_BYTES;
  const uploadMaxBytes = options.uploadMaxBytes ?? FEEDBACK_IMAGE_MAX_BYTES;
  const longEdgeSteps = options.longEdgeSteps ?? FEEDBACK_IMAGE_LONG_EDGE_STEPS;
  const qualitySteps = options.qualitySteps ?? FEEDBACK_IMAGE_QUALITY_STEPS;
  const outputMimeType =
    options.outputMimeType ?? FEEDBACK_IMAGE_COMPRESS_OUTPUT_MIME;
  const originalBytes = file.size;

  if (!file.type || !isAllowedFeedbackImageMime(file.type)) {
    return {
      ok: false,
      error: "画像は JPEG / PNG / WebP のみ対応しています。",
    };
  }
  if (originalBytes > selectMaxBytes) {
    return {
      ok: false,
      error: `画像は${formatFeedbackImageBytes(selectMaxBytes)}以下にしてください。`,
    };
  }
  if (originalBytes === 0) {
    return { ok: false, error: "画像が空です。" };
  }
  if (originalBytes <= uploadMaxBytes) {
    return {
      ok: true,
      file,
      originalBytes,
      outputBytes: originalBytes,
      compressed: false,
    };
  }

  const codec = options.codec ?? defaultBrowserCodec();
  let bitmap: FeedbackImageBitmapLike;
  try {
    bitmap = await codec.decode(file);
  } catch {
    return {
      ok: false,
      error: "画像の読み込みに失敗しました。別のファイルを選んでください。",
    };
  }

  if (
    !Number.isFinite(bitmap.width) ||
    !Number.isFinite(bitmap.height) ||
    bitmap.width < 1 ||
    bitmap.height < 1
  ) {
    bitmap.close?.();
    return {
      ok: false,
      error: "画像の読み込みに失敗しました。別のファイルを選んでください。",
    };
  }

  try {
    let bestBlob: Blob | null = null;

    for (const maxLongEdge of longEdgeSteps) {
      const target = computeFeedbackImageTargetSize(
        bitmap.width,
        bitmap.height,
        maxLongEdge
      );
      for (const quality of qualitySteps) {
        let encoded: Blob;
        try {
          encoded = await codec.encode({
            source: bitmap,
            width: target.width,
            height: target.height,
            mimeType: outputMimeType,
            quality,
          });
        } catch {
          return {
            ok: false,
            error: "画像の圧縮に失敗しました。別のファイルを選んでください。",
          };
        }
        if (!bestBlob || encoded.size < bestBlob.size) {
          bestBlob = encoded;
        }
        if (encoded.size < uploadMaxBytes) {
          const extension = outputMimeType === "image/webp" ? "webp" : "jpg";
          const output = new File([encoded], `feedback-image.${extension}`, {
            type: outputMimeType,
            lastModified: Date.now(),
          });
          return {
            ok: true,
            file: output,
            originalBytes,
            outputBytes: output.size,
            compressed: true,
          };
        }
      }
    }

    return {
      ok: false,
      error:
        "画像を規定サイズに圧縮できませんでした。解像度の低い画像か、別の画像をお試しください。",
    };
  } finally {
    bitmap.close?.();
  }
}
