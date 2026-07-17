"use client";

import { useState } from "react";

type PrefetchResult = {
  total: number;
  withProviders: number;
};

export function CacheControls({ emptyCount }: { emptyCount: number }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"clear" | "prefetch" | null>(null);

  async function clearEmptyCache() {
    setLoading(true);
    setAction("clear");
    setStatus(null);
    try {
      const res = await fetch("/api/debug/streaming-cache", { method: "DELETE" });
      const data = await res.json() as { message: string };
      setStatus(data.message);
    } catch {
      setStatus("エラーが発生しました");
    } finally {
      setLoading(false);
      setAction(null);
    }
  }

  async function prefetchAll() {
    setLoading(true);
    setAction("prefetch");
    setStatus("TMDb を照合中... (30〜60秒かかります)");
    try {
      const res = await fetch("/api/debug/streaming-prefetch", { method: "POST" });
      const data = await res.json() as PrefetchResult;
      setStatus(`完了: ${data.total}本中 ${data.withProviders}本で配信情報を取得しました。ページを更新してください。`);
    } catch {
      setStatus("エラーが発生しました");
    } finally {
      setLoading(false);
      setAction(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void clearEmptyCache()}
          disabled={loading || emptyCount === 0}
          style={{
            padding: "6px 14px",
            background: emptyCount > 0 && !loading ? "#f59e0b" : "#ccc",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: emptyCount > 0 && !loading ? "pointer" : "default",
            fontWeight: "bold",
            fontSize: "13px",
          }}
        >
          {action === "clear" ? "削除中..." : `⬜ 空キャッシュを削除 (${emptyCount}件)`}
        </button>

        <button
          type="button"
          onClick={() => void prefetchAll()}
          disabled={loading}
          style={{
            padding: "6px 14px",
            background: loading ? "#ccc" : "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "default" : "pointer",
            fontWeight: "bold",
            fontSize: "13px",
          }}
        >
          {action === "prefetch" ? "照合中..." : "🔍 全件を TMDb で照合"}
        </button>

        <a
          href="/debug/streaming"
          style={{ padding: "6px 14px", background: "#6b7280", color: "#fff", borderRadius: "6px", textDecoration: "none", fontSize: "13px" }}
        >
          🔄 ページ更新
        </a>
      </div>

      {status ? (
        <div style={{ fontSize: "12px", color: action === "prefetch" && loading ? "#f59e0b" : "#22c55e", padding: "4px 0" }}>
          {status}
        </div>
      ) : null}
    </div>
  );
}
