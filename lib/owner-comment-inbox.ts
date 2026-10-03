export const OWNER_COMMENT_INBOX_PAGE_SIZE = 20;
export const OWNER_COMMENT_PREVIEW_LENGTH = 120;

export type CommentableShareKind = "tier" | "dashboard" | "watchlist";

export type OwnerCommentInboxItem = {
  shareId: string;
  kind: CommentableShareKind;
  sharedAt: string;
  commentCount: number;
  latestCommentAt: string;
  preview: string;
};

export type OwnerCommentInboxPage = {
  items: OwnerCommentInboxItem[];
  nextCursor: string | null;
};

export type OwnerCommentInboxCursor = { latestCommentAt: string; shareId: string };

export function parseOwnerCommentInboxCursor(value: string): OwnerCommentInboxCursor | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([A-Za-z0-9_-]{1,64})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(match[1]))) return null;
  return { latestCommentAt: match[1], shareId: match[2] };
}

export const COMMENTABLE_SHARE_LABELS: Record<CommentableShareKind, string> = {
  tier: "Tier表",
  dashboard: "好み分析",
  watchlist: "マイリスト"
};

export function ownerCommentShareHref(item: Pick<OwnerCommentInboxItem, "kind" | "shareId">): string {
  const prefix = { tier: "/share/", dashboard: "/dashboard/share/", watchlist: "/watchlist/share/" }[item.kind];
  return `${prefix}${encodeURIComponent(item.shareId)}`;
}

export function ownerCommentPreview(body: string): string {
  const characters = Array.from(body);
  return characters.length > OWNER_COMMENT_PREVIEW_LENGTH
    ? `${characters.slice(0, OWNER_COMMENT_PREVIEW_LENGTH - 1).join("")}…`
    : body;
}
