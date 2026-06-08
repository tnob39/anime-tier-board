"use client";

import { useState } from "react";

export function CacheControls({ emptyCount }: { emptyCount: number }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function clearEmptyCache() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/debug/streaming-cache", { method: "DELETE" });
      const data = await res.json() as { message: string };
      setStatus(data.message);
    } catch {
      setStatus("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
      <button
        onClick={() => void clearEmptyCache()}
        disabled={loading || emptyCount === 0}
        style={{
          padding: "6px 14px",
          background: emptyCount > 0 ? "#f59e0b" : "#ccc",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: emptyCount > 0 ? "pointer" : "default",
          fontWeight: "bold",
          fontSize: "13px",
        }}
      >
        {loading ? "削除中..." : `⬜ 空キャッシュを削除して再取得 (${emptyCount}件)`}
      </button>

      <a
        href="/debug/streaming"
        style={{ padding: "6px 14px", background: "#6b7280", color: "#fff", borderRadius: "6px", textDecoration: "none", fontSize: "13px" }}
      >
        🔄 ページ更新
      </a>

      {status ? (
        <span style={{ fontSize: "12px", color: "#22c55e" }}>{status}</span>
      ) : null}
    </div>
  );
}
