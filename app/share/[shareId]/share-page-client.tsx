"use client";

import { MessageCircle } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import { ShareCardCTA } from "@/components/ShareCardCTA";
import type { BoardShare, ShareComment } from "@/lib/shares";
import type { AnimeItem } from "@/lib/types";
import { SEASON_LABELS } from "@/lib/types";

const UNRANKED_TIER_ID = "tier-unranked";

export function SharePageClient({
  initialShare
}: {
  initialShare: BoardShare;
}) {
  const { data: session, status: authStatus } = useSession();
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const itemMap = useMemo(
    () => new Map(initialShare.items.map((item) => [item.id, item])),
    [initialShare.items]
  );
  const visibleTiers = initialShare.board.tiers.filter(
    (tier) => tier.id !== UNRANKED_TIER_ID
  );
  const isAuthenticated = authStatus === "authenticated";

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/shares/${initialShare.shareId}/comments`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load comments.");
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
          setMessage(error instanceof Error ? error.message : "Failed to load comments.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialShare.shareId]);

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
        throw new Error("Comment failed.");
      }

      const payload = (await response.json()) as { comment: ShareComment };
      setComments((current) => [...current, payload.comment]);
      setCommentBody("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Comment failed.");
    } finally {
      setCommenting(false);
    }
  }

  return (
    <main className="app-main share-main">
      <header className="share-header">
        <div>
          <h1>Anime Tier Share</h1>
          <p>
            {initialShare.board.seasonYear} {SEASON_LABELS[initialShare.board.season]}
          </p>
        </div>
      </header>

      {message ? (
        <div className="notice error" role="alert">
          {message}
        </div>
      ) : null}

      <section className="export-surface share-surface" aria-label="Shared tier board">
        <div className="export-heading">
          <strong>
            {initialShare.board.seasonYear} {SEASON_LABELS[initialShare.board.season]}
          </strong>
        </div>
        <div className="tier-list">
          {visibleTiers.map((tier) => (
            <div
              key={tier.id}
              className="tier-row share-tier-row"
              style={
                {
                  "--tier-color": tier.color,
                  "--tier-text": getReadableTextColor(tier.color)
                } as CSSProperties
              }
            >
              <div className="tier-label">
                <span>{tier.label}</span>
              </div>
              <div className="tier-items">
                {tier.itemIds
                  .map((itemId) => itemMap.get(itemId))
                  .filter((item): item is AnimeItem => Boolean(item))
                  .map((item) => (
                    <article key={item.id} className="anime-card is-compact" title={item.title}>
                      {item.proxiedImageUrl ? (
                        <img src={item.proxiedImageUrl} alt={item.title} draggable={false} loading="lazy" />
                      ) : (
                        <AnimeCardPlaceholder title={item.title} draggable={false} />
                      )}
                      {item.streamingProvidersJp?.flatrate?.[0]?.logoUrl ? (
                        <span className="share-tier-provider-badge" title={item.streamingProvidersJp.flatrate[0].name}>
                          <img
                            src={item.streamingProvidersJp.flatrate[0].logoUrl}
                            alt={item.streamingProvidersJp.flatrate[0].name}
                            width={16}
                            height={16}
                          />
                        </span>
                      ) : null}
                    </article>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ShareCardCTA
        headline="あなたも今期のアニメを Tier 表にして布教しよう"
        buttonLabel="自分の Tier 表を作る"
        href="/tier?from=share"
      />

      <section className="comment-panel" aria-label="Share comments">
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
                  <strong>{comment.userName ?? "名無しさん"}</strong>
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
              placeholder="感想を書く…"
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
            Google ログインしてコメント
          </button>
        )}
        {session?.user?.name ? <p className="comment-user">{session.user.name} としてログイン中</p> : null}
      </section>
    </main>
  );
}

function getReadableTextColor(hex: string): string {
  const normalized = hex.replace("#", "");

  if (normalized.length !== 6) {
    return "#111827";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.56 ? "#111827" : "#ffffff";
}
