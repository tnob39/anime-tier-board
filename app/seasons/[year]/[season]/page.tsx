import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchSeasonalAnime } from "@/lib/anime-sources";
import { normalizeSeason, seasonLabelJa } from "@/lib/season";
import {
  buildProviderMapWithStats,
  enrichWithStreamingProviders,
} from "@/lib/streaming-providers";
import { SEASON_LABELS, type AnimeItem, type AnimeSeason } from "@/lib/types";

type SeasonPageParams = {
  year: string;
  season: string;
};

const DEFAULT_ORIGIN = "https://anime-tier-board.vercel.app";

function getSiteOrigin(): string {
  const configuredUrl = process.env.AUTH_URL?.trim();
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const origin = configuredUrl || (vercelUrl ? `https://${vercelUrl}` : DEFAULT_ORIGIN);

  return origin.replace(/\/$/, "");
}

function parseParams(params: SeasonPageParams): {
  year: number;
  season: AnimeSeason;
} | null {
  const year = Number(params.year);
  const season = normalizeSeason(params.season);

  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100 ||
    !season ||
    params.season !== params.season.toLowerCase()
  ) {
    return null;
  }

  return { year, season };
}

function getJapaneseTitle(item: AnimeItem): string {
  return item.titles.native?.trim() || item.title;
}

function getBroadcastLabel(item: AnimeItem): string | null {
  if (item.airing?.broadcastText) {
    return item.airing.broadcastText;
  }

  if (!item.airing?.broadcastDay) {
    return null;
  }

  return [item.airing.broadcastDay, item.airing.broadcastTime]
    .filter(Boolean)
    .join(" ");
}

function getAniListPlatforms(item: AnimeItem): Array<{ name: string; url: string }> {
  const platforms = new Map<string, { name: string; url: string }>();

  for (const platform of item.streamingPlatforms ?? []) {
    if (platform.name && platform.url) {
      platforms.set(platform.name.toLowerCase(), {
        name: platform.name,
        url: platform.url,
      });
    }
  }

  for (const episode of item.streamingEpisodes ?? []) {
    const name = episode.site?.trim();
    if (name && episode.url && !platforms.has(name.toLowerCase())) {
      platforms.set(name.toLowerCase(), { name, url: episode.url });
    }
  }

  return Array.from(platforms.values()).slice(0, 5);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<SeasonPageParams>;
}): Promise<Metadata> {
  const parsed = parseParams(await params);

  if (!parsed) {
    return {};
  }

  const label = seasonLabelJa(parsed.season, parsed.year);
  const title = `${parsed.year}年${SEASON_LABELS[parsed.season]}アニメ 配信どこで見れる一覧 | numanie`;
  const description = `${label}アニメの見放題配信サービスを作品ごとにまとめて確認できます。気になる作品を見つけて、自分だけのTier表も作れます。`;
  const canonical = `${getSiteOrigin()}/seasons/${parsed.year}/${parsed.season.toLowerCase()}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<SeasonPageParams>;
}) {
  const parsed = parseParams(await params);

  if (!parsed) {
    notFound();
  }

  const result = await fetchSeasonalAnime(parsed.year, parsed.season);
  const { map: providerMap } = await buildProviderMapWithStats(result.items, {
    skipUncached: true,
  });
  const items = enrichWithStreamingProviders(result.items, providerMap);
  const seasonName = SEASON_LABELS[parsed.season];

  return (
    <main className="season-page">
      <header className="season-page-header">
        <p className="season-page-kicker">季節アニメ配信ガイド</p>
        <h1>
          {parsed.year}年{seasonName}アニメ 配信どこで見れる一覧
        </h1>
        <p>
          {parsed.year}年{seasonName}のアニメを、見放題の配信サービスとあわせて一覧で確認できます。
        </p>
        <Link className="season-page-cta" href="/">
          自分のTier表を作る
        </Link>
      </header>

      <p className="season-page-count">{items.length}作品を掲載</p>

      <section className="season-page-grid" aria-label={`${parsed.year}年${seasonName}アニメ一覧`}>
        {items.map((item) => {
          const title = getJapaneseTitle(item);
          const broadcast = getBroadcastLabel(item);
          const providers = item.streamingProvidersJp?.flatrate ?? [];
          const providerLink = item.streamingProvidersJp?.providerLink;
          const aniListPlatforms = getAniListPlatforms(item);

          return (
            <article className="season-page-card" key={`${item.source}-${item.id}`}>
              <a
                className="season-page-cover-link"
                href={item.siteUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`${title}の作品情報を見る`}
              >
                {item.proxiedImageUrl || item.imageUrl ? (
                  <img
                    className="season-page-cover"
                    src={item.proxiedImageUrl || item.imageUrl}
                    alt={`${title}のカバー画像`}
                    loading="lazy"
                  />
                ) : (
                  <span className="season-page-cover-placeholder">{title}</span>
                )}
              </a>

              <div className="season-page-card-body">
                <h2>{title}</h2>
                {broadcast || item.score ? (
                  <div className="season-page-meta">
                    {broadcast ? <span>{broadcast}</span> : null}
                    {item.score ? <span>スコア {item.score}</span> : null}
                  </div>
                ) : null}

                <div className="season-page-streaming">
                  <p>配信サービス</p>
                  {providers.length ? (
                    <div className="season-page-provider-list">
                      {providers.map((provider) =>
                        providerLink ? (
                          <a
                            key={provider.id}
                            href={providerLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {provider.logoUrl ? (
                              <img src={provider.logoUrl} alt="" loading="lazy" />
                            ) : null}
                            {provider.name}
                          </a>
                        ) : (
                          <span key={provider.id}>
                            {provider.logoUrl ? (
                              <img src={provider.logoUrl} alt="" loading="lazy" />
                            ) : null}
                            {provider.name}
                          </span>
                        ),
                      )}
                    </div>
                  ) : aniListPlatforms.length ? (
                    <div className="season-page-provider-list">
                      {aniListPlatforms.map((platform) => (
                        <a
                          key={`${platform.name}-${platform.url}`}
                          href={platform.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {platform.name}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="season-page-provider-empty">配信情報は未登録です</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <footer className="season-page-footer">
        <p>データ提供: AniList / Jikan</p>
        <Link className="season-page-cta" href="/">
          自分のTier表を作る
        </Link>
      </footer>
    </main>
  );
}
