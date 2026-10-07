import { auth } from "@/auth";
import { assertOptionalIdempotencyKey, consumeWriteRateLimit, WRITE_BODY_MAX_BYTES } from "@/lib/api/write-admission";
import { assertSameOriginBrowserWrite, jsonWriteError, readJsonWithByteLimit, readBodyBytesWithLimit } from "@/lib/api/write-request-guard";
import { withApiRoute } from "@/lib/api/with-api-route";
import { createShare, getShare, type SharedBoard } from "@/lib/shares";
import { publishImpressionShare, getImpressionShare, listImpressionShares, stopImpressionShare } from "@/lib/season-impression-shares";
import { isRecord, parseImpressionShare } from "@/lib/season-impressions-model";
import { SEASONS, type AnimeItem } from "@/lib/types";
import { assertImpressionOwner, IMPRESSION_PRIVATE_HEADERS } from "@/lib/api/season-impressions-handlers";

type ShareSession = { user?: { id?: string | null } } | null;
type Context = { params: Promise<{ shareId: string }> };
export function createShareHandlers(overrides: Partial<{
  session: () => Promise<ShareSession>;
  createBoard: typeof createShare;
  getBoard: typeof getShare;
  create: typeof publishImpressionShare;
  get: typeof getImpressionShare;
  list: typeof listImpressionShares;
  stop: typeof stopImpressionShare;
  assertSameOrigin: typeof assertSameOriginBrowserWrite;
  rateLimit: (...args: Parameters<typeof consumeWriteRateLimit>) => Response | null | Promise<Response | null>;
  readJson: typeof readJsonWithByteLimit;
}> = {}) {
  const deps = { session: auth as () => Promise<ShareSession>, createBoard: createShare, getBoard: getShare,
    create: publishImpressionShare, get: getImpressionShare, list: listImpressionShares, stop: stopImpressionShare,
    assertSameOrigin: assertSameOriginBrowserWrite, rateLimit: consumeWriteRateLimit, readJson: readJsonWithByteLimit, ...overrides };
  const POST = withApiRoute("shares.POST", async (request) => {
    const userId = (await deps.session())?.user?.id;
    if (!userId) return jsonWriteError("ログインが必要です。", 401);
    const denied = assertImpressionOwner(request, userId) ?? deps.assertSameOrigin(request) ?? assertOptionalIdempotencyKey(request)
      ?? await deps.rateLimit(request, { userId, policy: "shareCreate" });
    if (denied) return denied;
    const parsed = await deps.readJson<unknown>(request, WRITE_BODY_MAX_BYTES.share);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    if (!isRecord(payload)) return jsonWriteError("共有内容が不正です。", 400);
    if (payload.kind === "season-impressions") {
      const input = parseImpressionShare(payload);
      if (!input) return jsonWriteError("共有する作品・項目の指定が不正です。", 400);
      const published = await deps.create(userId, input);
      if (!published) return jsonWriteError("記録が変更されています。最新の記録からプレビューを作り直してください。", 409);
      return Response.json(published, { headers: IMPRESSION_PRIVATE_HEADERS });
    }
    if (payload.kind !== undefined || !isSharedBoard(payload.board) || !Array.isArray(payload.items) || payload.items.length > 300) {
      return jsonWriteError("Invalid share payload", 400);
    }
    return Response.json({ shareId: await deps.createBoard(userId, payload.board, payload.items as AnimeItem[]) });
  });
  const LIST = withApiRoute("shares.GET", async (request) => {
    const userId = (await deps.session())?.user?.id;
    if (!userId) return jsonWriteError("ログインが必要です。", 401);
    const mismatch = assertImpressionOwner(request, userId);
    if (mismatch) return mismatch;
    if (new URL(request.url).searchParams.get("kind") !== "season-impressions") return jsonWriteError("共有種別が不正です。", 400);
    return Response.json({ shares: await deps.list(userId) }, { headers: IMPRESSION_PRIVATE_HEADERS });
  });
  const GET = (request: Request, context: Context) => withApiRoute("shares.public.GET", async () => {
    const { shareId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(shareId)) return jsonWriteError("共有が見つかりません。", 404);
    const share = await deps.get(shareId) ?? await deps.getBoard(shareId);
    return share ? Response.json({ share }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } })
      : jsonWriteError("共有が見つかりません。", 404, { "Cache-Control": "no-store" });
  })(request);
  const DELETE = (request: Request, context: Context) => withApiRoute("shares.DELETE", async () => {
    const userId = (await deps.session())?.user?.id;
    if (!userId) return jsonWriteError("ログインが必要です。", 401);
    const denied = assertImpressionOwner(request, userId) ?? deps.assertSameOrigin(request) ?? assertOptionalIdempotencyKey(request)
      ?? await deps.rateLimit(request, { userId, policy: "userWrite" });
    if (denied) return denied;
    const { shareId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(shareId)) return jsonWriteError("共有が見つかりません。", 404);
    const body = await readBodyBytesWithLimit(request, WRITE_BODY_MAX_BYTES.jsonDefault);
    if (!body.ok) return body.response;
    return await deps.stop(userId, shareId) ? Response.json({ ok: true }, { headers: IMPRESSION_PRIVATE_HEADERS })
      : jsonWriteError("共有が見つかりません。", 404);
  })(request);
  return { POST, LIST, GET, DELETE };
}
function isSharedBoard(value: unknown): value is SharedBoard {
  return isRecord(value) && value.kind === undefined && typeof value.version === "number" && typeof value.seasonYear === "number"
    && SEASONS.includes(value.season as SharedBoard["season"]) && typeof value.updatedAt === "string"
    && Array.isArray(value.tiers) && value.tiers.length <= 20;
}
