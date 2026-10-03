import { requireUserId } from "@/lib/api/auth-helpers";
import { withApiRoute } from "@/lib/api/with-api-route";
import { parseOwnerCommentInboxCursor } from "@/lib/owner-comment-inbox";
import { listOwnerCommentInbox } from "@/lib/shares";

export function createOwnerCommentInboxHandler(overrides: Partial<{
  requireUserId: typeof requireUserId;
  list: typeof listOwnerCommentInbox;
}> = {}) {
  const deps = { requireUserId, list: listOwnerCommentInbox, ...overrides };
  const handler = withApiRoute("dashboard.comments.GET", async (request) => {
    const userId = await deps.requireUserId();
    const expectedOwner = request.headers.get("x-comment-inbox-owner");
    if (expectedOwner !== null && expectedOwner !== userId) {
      return Response.json({ error: "アカウントが変更されました。ログイン状態を確認してください。" }, { status: 409 });
    }
    const params = new URL(request.url).searchParams;
    // No shareId/userId filter is accepted: ownership comes only from authentication.
    if ([...params.keys()].some((key) => key !== "cursor") || params.getAll("cursor").length > 1) {
      return Response.json({ error: "一覧の指定が不正です。" }, { status: 400 });
    }
    const rawCursor = params.get("cursor");
    const cursor = rawCursor === null ? null : parseOwnerCommentInboxCursor(rawCursor);
    if (rawCursor !== null && !cursor) {
      return Response.json({ error: "一覧の指定が不正です。" }, { status: 400 });
    }
    return Response.json(await deps.list(userId, cursor));
  });
  return async (request: Request) => {
    const response = await handler(request);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie, Authorization");
    return response;
  };
}
