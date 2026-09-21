import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  WRITE_BODY_MAX_BYTES,
  consumeWriteRateLimit,
} from "@/lib/api/write-admission";
import {
  assertSameOriginBrowserWrite,
  readJsonWithByteLimit,
} from "@/lib/api/write-request-guard";
import { normalizeComment } from "@/lib/evangelist-cards";
import { getCurrentAnimeSeason, normalizeSeason } from "@/lib/season";
import { createSeasonShare } from "@/lib/season-share";

const ALLOWED_STATUSES = ["watching", "planned", "completed"] as const;
const DEFAULT_STATUSES = [...ALLOWED_STATUSES];

type CreatePayload = {
  season?: unknown;
  seasonYear?: unknown;
  statuses?: unknown;
  comment?: unknown;
};

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const originDenied = assertSameOriginBrowserWrite(request);
  if (originDenied) return originDenied;

  const limited = consumeWriteRateLimit(request, {
    userId,
    policy: "shareCreate",
  });
  if (limited) return limited;

  const parsed = await readJsonWithByteLimit<CreatePayload>(
    request,
    WRITE_BODY_MAX_BYTES.seasonShare
  );
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

  const current = getCurrentAnimeSeason();
  const season =
    typeof payload.season === "string"
      ? normalizeSeason(payload.season)
      : current.season;
  const seasonYear =
    payload.seasonYear === undefined ? current.year : Number(payload.seasonYear);

  if (!season || !Number.isInteger(seasonYear) || seasonYear < 1900 || seasonYear > 2200) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  const statuses = Array.isArray(payload.statuses)
    ? payload.statuses.filter(
        (status): status is (typeof ALLOWED_STATUSES)[number] =>
          typeof status === "string" &&
          ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])
      )
    : DEFAULT_STATUSES;
  const uniqueStatuses = [...new Set(statuses)];
  const comment =
    typeof payload.comment === "string" ? normalizeComment(payload.comment) : null;

  const shareId = await createSeasonShare({
    userId,
    season,
    seasonYear,
    statuses: uniqueStatuses,
    comment,
  });

  return NextResponse.json({ shareId });
}
