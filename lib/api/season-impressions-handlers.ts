import { requireWriteIdentity } from "@/lib/api/auth-helpers";
import { admitCookieCapableWrite, assertOptionalIdempotencyKey, WRITE_BODY_MAX_BYTES } from "@/lib/api/write-admission";
import { jsonWriteError, readJsonWithByteLimit } from "@/lib/api/write-request-guard";
import { withApiRoute } from "@/lib/api/with-api-route";
import { isImpressionAnimeId, isImpressionSeason, parseImpressionInput, parseImpressionDelete } from "@/lib/season-impressions-model";
import { readImpressionSeasonState, saveSeasonImpression, deleteSeasonImpression } from "@/lib/season-impressions";

export const IMPRESSION_CONFLICT = "別の画面で記録が変更されました。入力を残したまま最新の記録を確認してください。";
export const IMPRESSION_PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ animeId: string }> };

// The header is a consistency guard, never an authentication source. A stale tab must not write A's input as B.
export function assertImpressionOwner(request: Request, userId: string): Response | null {
  const expected = request.headers.get("X-Impression-Owner");
  return expected !== null && expected !== encodeURIComponent(userId)
    ? jsonWriteError("ログイン中のアカウントが変わりました。元のアカウントでログインし直してください。", 401)
    : null;
}

export function createImpressionHandlers(overrides: Partial<{
  identity: typeof requireWriteIdentity;
  list: typeof readImpressionSeasonState;
  save: typeof saveSeasonImpression;
  remove: typeof deleteSeasonImpression;
  admit: (...args: Parameters<typeof admitCookieCapableWrite>) => Response | null | Promise<Response | null>;
}> = {}) {
  const deps = { identity: requireWriteIdentity, list: readImpressionSeasonState, save: saveSeasonImpression, remove: deleteSeasonImpression, admit: admitCookieCapableWrite, ...overrides };
  const GET = withApiRoute("season-impressions.GET", async (request) => {
    const { userId } = await deps.identity();
    const mismatch = assertImpressionOwner(request, userId);
    if (mismatch) return mismatch;
    const query = new URL(request.url).searchParams;
    const key = { year: Number(query.get("year")), season: query.get("season") };
    if (!isImpressionSeason(key)) return jsonWriteError("クールの指定が不正です。", 400);
    return Response.json(await deps.list(userId, key), { headers: IMPRESSION_PRIVATE_HEADERS });
  });
  const mutate = (method: "PUT" | "DELETE", request: Request, context: Context) => withApiRoute(`season-impressions.${method}`, async () => {
    const identity = await deps.identity();
    const denied = assertImpressionOwner(request, identity.userId)
      ?? await deps.admit(request, identity, "userWrite") ?? assertOptionalIdempotencyKey(request);
    if (denied) return denied;
    const { animeId } = await context.params;
    if (!isImpressionAnimeId(animeId)) return jsonWriteError("作品IDが不正です。", 400);
    const body = await readJsonWithByteLimit<unknown>(request, WRITE_BODY_MAX_BYTES.status);
    if (!body.ok) return body.response;
    if (method === "PUT") {
      const input = parseImpressionInput(body.data, animeId);
      if (!input) return jsonWriteError("記録の内容が不正です。一言は140文字以内で入力してください。", 400);
      const impression = await deps.save(identity.userId, input);
      return impression ? Response.json({ impression }, { headers: IMPRESSION_PRIVATE_HEADERS }) : jsonWriteError(IMPRESSION_CONFLICT, 409);
    }
    const input = parseImpressionDelete(body.data);
    if (!input) return jsonWriteError("削除する記録の指定が不正です。", 400);
    const deleted = await deps.remove(identity.userId, animeId, input);
    return deleted ? Response.json({ ok: true, cursor: deleted }, { headers: IMPRESSION_PRIVATE_HEADERS }) : jsonWriteError(IMPRESSION_CONFLICT, 409);
  })(request);
  return { GET, PUT: (request: Request, context: Context) => mutate("PUT", request, context), DELETE: (request: Request, context: Context) => mutate("DELETE", request, context) };
}
