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
    <main className="page-shell" style={{ padding: "2rem 1rem", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        表示中にエラーが発生しました
      </h1>
      <p style={{ color: "#666", marginBottom: "1.25rem", lineHeight: 1.6 }}>
        ページの読み込みに失敗しました。再試行するか、トップに戻ってください。
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          再試行
        </button>
        <a
          href="/"
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          トップへ
        </a>
      </div>
    </main>
  );
}