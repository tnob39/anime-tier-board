import { getTursoClient } from "@/lib/turso";
import { fetchSeasonalAnime } from "@/lib/anime-sources";
import { getCurrentAnimeSeason } from "@/lib/season";

export const dynamic = "force-dynamic";

export default async function StreamingDebugPage() {
  const { year, season } = getCurrentAnimeSeason();

  // DB キャッシュを全件取得
  const client = getTursoClient();
  const dbRows = await client
    .execute(
      "SELECT anime_title, jp_flatrate, updated_at FROM anime_streaming_providers ORDER BY updated_at DESC"
    )
    .catch(() => ({ rows: [] }));

  const cached = new Map(
    dbRows.rows
      .filter((r) => r.anime_title)
      .map((r) => [
        r.anime_title as string,
        {
          providers: (() => {
            try {
              return JSON.parse(r.jp_flatrate as string) as Array<{ name: string }>;
            } catch {
              return [];
            }
          })(),
          updatedAt: r.updated_at as string,
        },
      ])
  );

  // 季節アニメ一覧（AniList のみ、TMDb 呼び出しなし）
  const seasonal = await fetchSeasonalAnime(year, season).catch(() => ({ items: [] }));

  const rows = seasonal.items.map((item) => {
    const hit = cached.get(item.title) ?? cached.get(item.titles?.romaji ?? "");
    return {
      title: item.title,
      cached: Boolean(hit),
      providers: hit?.providers ?? [],
      updatedAt: hit?.updatedAt ?? null,
    };
  });

  const hitCount = rows.filter((r) => r.cached).length;
  const withProviders = rows.filter((r) => r.providers.length > 0).length;

  return (
    <main style={{ padding: "16px", fontFamily: "monospace", fontSize: "13px" }}>
      <h1 style={{ fontSize: "16px", marginBottom: "8px" }}>
        Streaming Provider Debug — {season} {year}
      </h1>

      <p style={{ marginBottom: "12px", color: "#666" }}>
        季節アニメ {rows.length}本 / DBキャッシュあり {hitCount}本 / JP flatrate あり {withProviders}本
        <br />
        DBキャッシュ総件数: {dbRows.rows.length}件
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={th}>タイトル</th>
            <th style={th}>キャッシュ</th>
            <th style={th}>配信サービス</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.title} style={{ borderBottom: "1px solid #eee" }}>
              <td style={td}>{row.title}</td>
              <td style={{ ...td, textAlign: "center" }}>
                {row.cached ? "✅" : "❌"}
              </td>
              <td style={td}>
                {row.providers.length > 0
                  ? row.providers.map((p) => p.name).join(", ")
                  : row.cached
                    ? "—（配信なし）"
                    : "未取得"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const th: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  borderBottom: "2px solid #ccc",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "5px 8px",
  verticalAlign: "top",
};
