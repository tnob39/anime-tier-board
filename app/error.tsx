"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      className="page-shell"
      role="alert"
      style={{ padding: "2rem 1rem", maxWidth: 480, margin: "0 auto" }}
    >
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        表示中にエラーが発生しました
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.5rem", lineHeight: 1.6 }}>
        ページの読み込みに失敗しました。再試行するか、トップに戻ってください。
      </p>
      <p style={{ color: "var(--muted)", marginBottom: "1.25rem", lineHeight: 1.6, fontSize: "0.9rem" }}>
        視聴記録やTier表の保存済みデータは失われていません。
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" className="command-button emphasis-button" onClick={() => reset()}>
          再試行
        </button>
        <a href="/" className="command-button">
          トップへ
        </a>
      </div>
    </main>
  );
}