import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { AppError } from "@/lib/errors/app-error";
import { isViewingStatus, patchStatusAndWatchedEpisodes } from "@/lib/statuses";

const MAX_PATCH_PAYLOAD_BYTES = 8_000;

type PatchPayload = {
  status?: unknown;
  watchedEpisodes?: unknown;
  expectedUpdatedAt?: unknown;
};

function isValidIsoTimestamp(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed);
}

function isValidPatchWatchedEpisodes(value: unknown): value is number | null {
  if (value === null) {
    return true;
  }

  if (typeof value !== "number") {
    return false;
  }

  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function validatePatchPayload(payload: PatchPayload) {
  if (
    typeof payload.status !== "string" ||
    !isViewingStatus(payload.status)
  ) {
    throw new AppError({
      message: "ステータスの内容が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  if (!("watchedEpisodes" in payload) || !isValidPatchWatchedEpisodes(payload.watchedEpisodes)) {
    throw new AppError({
      message: "視聴話数の内容が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  if (
    typeof payload.expectedUpdatedAt !== "string" ||
    !isValidIsoTimestamp(payload.expectedUpdatedAt)
  ) {
    throw new AppError({
      message: "更新日時の内容が不正です。",
      status: 400,
      code: "VALIDATION",
      expose: true
    });
  }

  return {
    status: payload.status,
    watchedEpisodes: payload.watchedEpisodes,
    expectedUpdatedAt: payload.expectedUpdatedAt.trim()
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ animeId: string }> }
) {
  const { animeId } = await params;
  const trimmedAnimeId = animeId.trim();

  if (!trimmedAnimeId) {
    return withApiRoute("statuses.[animeId].PATCH", async () => {
      throw new AppError({
        message: "animeId が指定されていません。",
        status: 400,
        code: "VALIDATION",
        expose: true
      });
    })(request);
  }

  return withApiRoute("statuses.[animeId].PATCH", async (req: Request) => {
    const userId = await requireUserId();

    const rawBody = await req.text();
    if (rawBody.length > MAX_PATCH_PAYLOAD_BYTES) {
      throw new AppError({
        message: "送信データが大きすぎます。",
        status: 413,
        code: "VALIDATION",
        expose: true
      });
    }

    let payload: PatchPayload;

    try {
      payload = JSON.parse(rawBody) as PatchPayload;
    } catch {
      throw new AppError({
        message: "JSONの形式が正しくありません。",
        status: 400,
        code: "VALIDATION",
        expose: true
      });
    }

    const validated = validatePatchPayload(payload);
    const result = await patchStatusAndWatchedEpisodes({
      userId,
      animeId: trimmedAnimeId,
      status: validated.status,
      watchedEpisodes: validated.watchedEpisodes,
      expectedUpdatedAt: validated.expectedUpdatedAt
    });

    if (result.kind === "not_found") {
      throw new AppError({
        message: "視聴ステータスが見つかりません。",
        status: 404,
        code: "VALIDATION",
        expose: true
      });
    }

    if (result.kind === "conflict") {
      throw new AppError({
        message: "別の端末で更新されたため、保存できませんでした。",
        status: 409,
        code: "CONFLICT",
        expose: true
      });
    }

    return NextResponse.json({ item: result.item });
  })(request);
}