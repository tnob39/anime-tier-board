"use client";

import { Heart, MessageCircle, Sparkles, Star, ThumbsUp, Zap } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import type {
  ReactionCounts,
  ReactionKind,
  ShareComment,
  WatchlistShare
} from "@/lib/shares";
import type { ViewingStatus } from "@/lib/statuses";
import type { AnimeItem } from "@/lib/types";

const reactionOptions: Array<{
  kind: ReactionKind;
  label: string;
  icon: typeof Heart;
}> = [
  { kind: "like", label: "いいね", icon: Heart },
  { kind: "agree", label: "わかる", icon: ThumbsUp },
  { kind: "surprised", label: "気になる", icon: Zap },
  { kind: "want_to_watch", label: "見たい", icon: Sparkles }
];

const statusLabels: Record<ViewingStatus, string> = {
  planned: "見たい",
  watching: "視聴中",
  completed: "完了",
  paused: "一時停止",
  dropped: "中止"
};

export function WatchlistShareClient({
  initialShare,
  initialViewerReactions = []
}: {
  initialShare: WatchlistShare;
  initialViewerReactions?: ReactionKind[];
}) {
  const { data: session, status: authStatus } = useSession();
  const [reactionCounts, setReactionCounts] = useState<ReactionCounts>(
    initialShare.reactionCounts
  );
  const [viewerReactions, setViewerReactions] = useState<ReactionKind[]>(
    initialViewerReactions
  );
  const [reactingKind, setReactingKind] = useState<ReactionKind | null>(null);
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isAuthenticated = authStatus === "authenticated";

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/shares/${initialShare.shareId}/comments`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("コメントの取得に失敗しました。");
        }

        return response.json();
      })
      .then((payload: { comments?: ShareComment[] }) => {
        if (!cancelled) {
          setComments(payload.comments ?? []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "コメントの取得に失敗しました。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialShare.shareId]);

  async function handleReaction(kind: ReactionKind) {
    if (viewerReactions.includes(kind) || reactingKind) {
      return;
    }

    if (!isAuthenticated) {
      void signIn("google");
      return;
    }

    setReactingKind(kind);
    setMessage(null);

    try {
      const response = await fetch(`/api/shares/${initialShare.shareId}/reactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ kind })
      });

      if (!response.ok) {
        throw new Error("リアクションに失敗しました。");
      }

      const payload = (await response.json()) as {
        reactionCounts: ReactionCounts;
        viewerReactions: ReactionKind[];
      };

      setReactionCounts(payload.reactionCounts);
      setViewerReactions(payload.viewerReactions);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "リアクションに失敗しました。");
    } finally {
      setReactingKind(null);
    }
  }

  async function handleComment() {
    const body = commentBody.trim();
    if (!body || commenting) {
      return;
    }

    if (!isAuthenticated) {
      void signIn("google");
      return;
    }

    setCommenting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/shares/${initialShare.shareId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ body })
      });

      if (!response.ok) {
        throw new Error("コメント投稿に失敗しました。");
      }

      const payload = (await response.json()) as { comment: ShareComment };
      setComments((current) => [...current, payload.comment]);
      setCommentBody("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "コメント投稿に失敗しました。");
    } finally {
      setCommenting(false);
    }
  }

  return (
    <main className="app-main share-main">
      <header className="share-header">
        <div>
          <h1>追ってるアニメ共有</h1>
          <p>{initialShare.items.length}件の視聴管理リスト</p>
        </div>
        <div className="share-actions">
          {reactionOptions.map((option) => {
            const Icon = option.icon;
            const active = viewerReactions.includes(option.kind);

            return (
              <button
                key={option.kind}
                className={active ? "command-button reaction-button is-active" : "command-button reaction-button"}
                type="button"
                onClick={() => void handleReaction(option.kind)}
                disabled={active || reactingKind === option.kind}
              >
                <Icon size={17} fill={active ? "currentColor" : "none"} />
                <span>{option.label}</span>
                <strong>{reactionCounts[option.kind]}</strong>
              </button>
            );
          })}
        </div>
      </header>

      {message ? <div className="notice error">{message}</div> : null}

      <section className="shared-watchlist-grid" aria-label="共有された追ってる作品">
        {initialShare.items.map((record) =>
          record.anime ? (
            <article key={record.animeId} className="shared-watchlist-card">
              {record.anime.proxiedImageUrl ? (
                <img src={record.anime.proxiedImageUrl} alt={record.anime.title} />
              ) : (
                <AnimeCardPlaceholder title={record.anime.title} />
              )}
              <div>
                <strong>{record.anime.title}</strong>
                <span>{statusLabels[record.status]}</span>
                <div className="shared-watchlist-meta">
                  <span>
                    <Star size={13} fill="currentColor" />
                    {record.favoriteLevel ?? "-"}
                  </span>
                  <span>{record.watchSlot ?? "見るタイミング未設定"}</span>
                  {getShareSchedule(record.anime) ? (
                    <span>{getShareSchedule(record.anime)}</span>
                  ) : null}
                  {getShareCour(record.anime) ? (
                    <span>{getShareCour(record.anime)}</span>
                  ) : null}
                </div>
                {record.notes ? <p>{record.notes}</p> : null}
              </div>
            </article>
          ) : null
        )}
      </section>

      <section className="comment-panel" aria-label="コメント">
        <div className="comment-heading">
          <MessageCircle size={18} />
          <h2>コメント</h2>
          <span>{comments.length}</span>
        </div>

        <div className="comment-list">
          {comments.length ? (
            comments.map((comment) => (
              <article key={comment.id} className="comment-card">
                {comment.userImage ? (
                  <img src={comment.userImage} alt="" />
                ) : (
                  <div className="comment-avatar" />
                )}
                <div>
                  <strong>{comment.userName ?? "Google user"}</strong>
                  <p>{comment.body}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="comment-empty">まだコメントはありません。</p>
          )}
        </div>

        {isAuthenticated ? (
          <div className="comment-form">
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="コメントを書く..."
              maxLength={1000}
            />
            <button
              className="command-button emphasis-button"
              type="button"
              onClick={() => void handleComment()}
              disabled={commenting || !commentBody.trim()}
            >
              投稿
            </button>
          </div>
        ) : (
          <button
            className="command-button emphasis-button login-comment-button"
            type="button"
            onClick={() => void signIn("google")}
          >
            Googleログインしてコメント
          </button>
        )}
        {session?.user?.name ? <p className="comment-user">ログイン中: {session.user.name}</p> : null}
      </section>
    </main>
  );
}

function getShareSchedule(item: AnimeItem): string | null {
  if (item.airing?.nextEpisode?.airingAt) {
    const weekdayTime = formatWeekdayTime(item.airing.nextEpisode.airingAt);
    return weekdayTime ? `毎週${weekdayTime}` : null;
  }

  if (item.airing?.broadcastText) {
    return item.airing.broadcastText;
  }

  const day = item.airing?.broadcastDay;
  const time = item.airing?.broadcastTime;
  if (day && time) {
    return `${day} ${time}`;
  }

  return day ?? null;
}

function getShareCour(item: AnimeItem): string | null {
  if (item.airing?.courEstimate) {
    return item.airing.courEstimate;
  }
  if (typeof item.episodes !== "number" || item.episodes <= 0) {
    return null;
  }
  if (item.episodes <= 13) {
    return "1クール";
  }
  if (item.episodes <= 26) {
    return "2クール";
  }
  if (item.episodes <= 39) {
    return "3クール";
  }
  return "4クール以上";
}

function formatWeekdayTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
