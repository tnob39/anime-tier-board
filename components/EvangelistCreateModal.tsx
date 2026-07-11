"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import AnimeCardPlaceholder from "@/components/AnimeCardPlaceholder";
import type { AnimeItem } from "@/lib/types";
import { getStreamingProviders } from "@/lib/streaming-services";

const MAX_COMMENT_LENGTH = 50;

export function EvangelistCreateModal({
  anime,
  open,
  onClose,
  onCreated
}: {
  anime: AnimeItem;
  open: boolean;
  onClose: () => void;
  onCreated: (url: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const commentFieldId = useId();
  const providers = getStreamingProviders(anime);
  const trimmedComment = comment.trim();
  const canSubmit = trimmedComment.length > 0 && trimmedComment.length <= MAX_COMMENT_LENGTH;

  useEffect(() => {
    if (!open) {
      setComment("");
      setError(null);
      setCreating(false);
      return;
    }

    const previousActiveElement = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  async function handleCreate() {
    if (!canSubmit || creating) {
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/evangelist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          animeId: anime.id,
          comment: trimmedComment
        })
      });

      const payload = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "布教カードの作成に失敗しました。");
      }

      const shareUrl = `${window.location.origin}${payload.url}`;
      await navigator.clipboard?.writeText(shareUrl).catch(() => undefined);

      if (navigator.share) {
        try {
          await navigator.share({
            title: `${anime.title}のおすすめ`,
            text: trimmedComment,
            url: shareUrl
          });
        } catch (shareError) {
          if (shareError instanceof Error && shareError.name === "AbortError") {
            // User dismissed the native share sheet.
          }
        }
      }

      onCreated(shareUrl);
      onClose();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "布教カードの作成に失敗しました。"
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="evangelist-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={panelRef}
        className="evangelist-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evangelist-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="evangelist-sheet-preview">
          {anime.proxiedImageUrl ? (
            <img src={anime.proxiedImageUrl} alt={anime.title} draggable={false} />
          ) : (
            <AnimeCardPlaceholder title={anime.title} draggable={false} />
          )}
          <div>
            <strong id="evangelist-sheet-title">{anime.title}</strong>
            <span>布教カードを作る</span>
          </div>
        </div>

        <div className="evangelist-sheet-content">
          <label className="evangelist-sheet-field" htmlFor={commentFieldId}>
            <span>ひとこと *</span>
            <textarea
              id={commentFieldId}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="例: 音楽好きなら絶対刺さる。1話だけ見てみて。"
              maxLength={MAX_COMMENT_LENGTH}
              rows={3}
            />
          </label>
          <p className="evangelist-sheet-counter">
            {trimmedComment.length}/{MAX_COMMENT_LENGTH}文字
          </p>

          {providers.length ? (
            <div className="evangelist-sheet-providers">
              <span>配信</span>
              <div>
                {providers.map((provider) => (
                  <span key={provider.name}>{provider.name}</span>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="notice error" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        <div className="evangelist-sheet-actions">
          <button
            ref={cancelButtonRef}
            className="command-button"
            type="button"
            onClick={onClose}
            disabled={creating}
          >
            キャンセル
          </button>
          <button
            className="command-button emphasis-button"
            type="button"
            onClick={() => void handleCreate()}
            disabled={!canSubmit || creating}
          >
            {creating ? <Loader2 className="spin" size={16} /> : null}
            <span>作ってシェア</span>
          </button>
        </div>
      </section>
    </div>
  );
}