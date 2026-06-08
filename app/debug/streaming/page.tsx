import { getTursoClient } from "@/lib/turso";
import { fetchSeasonalAnime } from "@/lib/anime-sources";
import { getCurrentAnimeSeason } from "@/lib/season";
import { CacheControls } from "./cache-controls";

export const dynamic = "force-dynamic";

const ANILIST_STREAMING_QUERY = `
  query SeasonalAnime($season: MediaSeason, $seasonYear: Int) {
    Page(page: 1, perPage: 50) {
      media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC, isAdult: false) {
        id
        title { native romaji english }
        externalLinks { url site type language }
      }
    }
  }
`;

export default async function StreamingDebugPage() {
  const { year, season } = getCurrentAnimeSeason();

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

  const seasonal = await fetchSeasonalAnime(year, season).catch(() => ({ items: [] }));

  // AniList externalLinks (no timeout risk — single GraphQL call)
  const anilistRes = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: ANILIST_STREAMING_QUERY, variables: { season, seasonYear: year } }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const anilistJson = await anilistRes?.json().catch(() => null) as { data?: { Page?: { media?: any[] } } } | null;
  const anilistMedia: any[] = anilistJson?.data?.Page?.media ?? [];

  const anilistMap = new Map<string, string[]>();
  for (const m of anilistMedia) {
    const sites = (m.externalLinks as any[])
      .filter((l) => l.type === "STREAMING")
      .map((l) => l.site as string);
    if (m.title.native) anilistMap.set(m.title.native as string, sites);
    if (m.title.romaji) anilistMap.set(m.title.romaji as string, sites);
  }

  const rows = seasonal.items.map((item) => {
    const hit = cached.get(item.title) ?? cached.get(item.titles?.romaji ?? "");
    const anilistSites =
      anilistMap.get(item.title) ??
      anilistMap.get(item.titles?.romaji ?? "") ??
      [];
    return {
      title: item.title,
      romaji: item.titles?.romaji ?? "",
      cached: Boolean(hit),
      hasProviders: (hit?.providers?.length ?? 0) > 0,
      providers: hit?.providers ?? [],
      anilistSites,
    };
  });

  const total = rows.length;
  const hitCount = rows.filter((r) => r.cached).length;
  const withProviders = rows.filter((r) => r.hasProviders).length;
  const emptyCache = rows.filter((r) => r.cached && !r.hasProviders).length;
  const notFetched = rows.filter((r) => !r.cached).length;
  const dbTotal = dbRows.rows.length;

  return (
    <main style={{ padding: "16px", fontFamily: "monospace", fontSize: "13px", maxWidth: "800px" }}>
      <h1 style={{ fontSize: "16px", marginBottom: "12px" }}>
        Streaming Provider Debug — {season} {year}
      </h1>

      <div style={{ background: "#f5f5f5", padding: "10px 12px", borderRadius: "8px", marginBottom: "16px", lineHeight: "1.8" }}>
        <div>季節アニメ: <b>{total}</b> 本</div>
        <div>✅ キャッシュあり+配信あり: <b style={{ color: "#22c55e" }}>{withProviders}</b> 本</div>
        <div>⬜ キャッシュあり+配信なし: <b style={{ color: "#f59e0b" }}>{emptyCache}</b> 本 ← 再取得対象</div>
        <div>❌ 未取得: <b style={{ color: "#ef4444" }}>{notFetched}</b> 本</div>
        <div style={{ marginTop: "4px", color: "#888" }}>DB総件数: {dbTotal} 件</div>
      </div>

      <CacheControls emptyCount={emptyCache} />

      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "16px" }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={th}>タイトル</th>
            <th style={th}>状態</th>
            <th style={th}>TMDb (JP flatrate)</th>
            <th style={{ ...th, background: "#e8f4fd" }}>AniList (externalLinks)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.title} style={{ borderBottom: "1px solid #eee" }}>
              <td style={td}>
                <div>{row.title}</div>
                {row.romaji && row.romaji !== row.title ? (
                  <div style={{ color: "#888", fontSize: "11px" }}>{row.romaji}</div>
                ) : null}
              </td>
              <td style={{ ...td, textAlign: "center" }}>
                {row.hasProviders ? "✅" : row.cached ? "⬜" : "❌"}
              </td>
              <td style={td}>
                {row.providers.length > 0
                  ? row.providers.map((p) => p.name).join(", ")
                  : row.cached
                    ? <span style={{ color: "#aaa" }}>配信なし（キャッシュ済）</span>
                    : <span style={{ color: "#ef4444" }}>未取得</span>}
              </td>
              <td style={{ ...td, background: "#f7fbff" }}>
                {row.anilistSites.length > 0
                  ? row.anilistSites.join(", ")
                  : <span style={{ color: "#aaa" }}>—</span>}
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
