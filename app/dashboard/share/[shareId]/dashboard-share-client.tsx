"use client";

import { Heart, MessageCircle, Sparkles, ThumbsUp, Zap } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import type {
  DashboardShare,
  ReactionCounts,
  ReactionKind,
  ShareComment
} from "@/lib/shares";
import type { ViewingStatus } from "@/lib/statuses";
import { DashboardSummary } from "../../dashboard-client";

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

export function DashboardShareClient({
  initialShare,
  initialViewerReactions = []
}: {
  initialShare: DashboardShare;
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
    <main className="app-main share-main dashboard-share-main">
      <header className="share-header">
        <div>
          <h1>好み分析の共有</h1>
          <p>{initialShare.data.totalStatuses}件の視聴ステータスから集計</p>
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

      {message ? (
        <div className="notice error" role="alert">
          {message}
        </div>
      ) : null}

      <DashboardSummary dashboard={initialShare.data} />

      <section className="dashboard-panel recent-panel">
        <h2>最近更新した作品</h2>
        {initialShare.data.recent.length ? (
          <div className="recent-grid">
            {initialShare.data.recent.map((record) => (
              <article key={record.animeId} className="recent-card">
                {record.anime ? (
                  record.anime.proxiedImageUrl ? (
                    <img src={record.anime.proxiedImageUrl} alt={record.anime.title} loading="lazy" />
                  ) : (
                    <AnimeCardPlaceholder title={record.anime.title} />
                  )
                ) : null}
                <div>
                  <strong>{record.anime?.title ?? record.animeId}</strong>
                  <span>{statusLabels[record.status]}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="comment-empty">最近更新した作品はありません。</p>
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
                  <img src={comment.userImage} alt="" loading="lazy" />
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
              aria-label="コメントを書く"
              maxLength={1000}
            />
            <p className="comment-counter">{commentBody.length}/1000文字</p>
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
