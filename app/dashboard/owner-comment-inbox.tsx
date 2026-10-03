"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMMENTABLE_SHARE_LABELS,
  ownerCommentPreview,
  ownerCommentShareHref,
  type OwnerCommentInboxPage
} from "@/lib/owner-comment-inbox";
import styles from "./owner-comment-inbox.module.css";

export function OwnerCommentInbox() {
  const { data: session, status } = useSession();
  const ownerId = (session?.user as { id?: string } | undefined)?.id;

  return (
    <section className={styles.inbox} aria-labelledby="owner-comment-inbox-heading">
      <h2 id="owner-comment-inbox-heading">共有へのコメント</h2>
      {status === "loading" ? <p role="status">コメントを読み込んでいます…</p>
        : status !== "authenticated" || !ownerId ? <LoginRequired />
          : <InboxContents key={ownerId} ownerId={ownerId} />}
    </section>
  );
}

function LoginRequired() {
  return (
    <div>
      <p role="status">ログインして共有へのコメントを確認してください。</p>
      <a className={styles.action} href="/?login=required&returnTo=%2Fdashboard">ログインする</a>
    </div>
  );
}

function InboxContents({ ownerId }: { ownerId: string }) {
  const [page, setPage] = useState<OwnerCommentInboxPage>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor: string | null = null) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(false);
    setLoginRequired(false);
    if (!cursor) setPage({ items: [], nextCursor: null });
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(`/api/dashboard/comments${query}`, {
        cache: "no-store",
        headers: { "x-comment-inbox-owner": ownerId },
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 409) {
        setPage({ items: [], nextCursor: null });
        setLoginRequired(true);
        return;
      }
      if (!response.ok) throw new Error("inbox unavailable");
      const result = await response.json() as OwnerCommentInboxPage;
      if (controller.signal.aborted) return;
      setPage((previous) => ({
        items: cursor
          ? [...previous.items.filter((item) => !result.items.some((next) => next.shareId === item.shareId)), ...result.items]
          : result.items,
        nextCursor: result.nextCursor
      }));
    } catch {
      if (!controller.signal.aborted) {
        setPage({ items: [], nextCursor: null });
        setError(true);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      pending.current?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  if (loginRequired) return <LoginRequired />;

  return (
    <>
      <div className={styles.toolbar}>
        <p>コメントの新しい共有から表示します。</p>
        <button className={styles.action} type="button" onClick={() => void load()} disabled={loading}>
          {error ? "再試行" : "更新する"}
        </button>
      </div>
      {error ? <p className={styles.error} role="alert">コメントを取得できませんでした。再試行してください。</p> : null}
      {loading ? <p role="status">コメントを読み込んでいます…</p> : null}
      {!loading && !error && page.items.length === 0 ? <p role="status">共有へのコメントはまだありません。</p> : null}
      {page.items.length > 0 ? (
        <ul className={styles.list}>
          {page.items.map((item) => (
            <li key={item.shareId} className={styles.item}>
              <h3>{COMMENTABLE_SHARE_LABELS[item.kind]}の共有</h3>
              <p className={styles.metadata}>共有日時：<time dateTime={item.sharedAt}>{formatDate(item.sharedAt)}</time></p>
              <p>コメント {item.commentCount}件</p>
              <p className={styles.metadata}>最新コメント：<time dateTime={item.latestCommentAt}>{formatDate(item.latestCommentAt)}</time></p>
              <p className={styles.preview}>{ownerCommentPreview(item.preview)}</p>
              <a className={styles.action} href={ownerCommentShareHref(item)}>
                共有を開く<span className="sr-only">（{COMMENTABLE_SHARE_LABELS[item.kind]}・{formatDate(item.sharedAt)}）</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {page.nextCursor ? (
        <button className={styles.action} type="button" onClick={() => void load(page.nextCursor)} disabled={loading}>
          もっと見る
        </button>
      ) : null}
    </>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ja-JP");
}
