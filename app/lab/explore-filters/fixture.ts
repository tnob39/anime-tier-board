import type { ExploreFixtureItem } from "./types.ts";

/** Lab-only target region. Never inferred from the viewer clock or IP. */
export const LAB_TARGET_REGION = "JP" as const;

/**
 * Lab-only approved source. This is not the production source-permissions ledger.
 * Production currently has zero `allowed` domains; the mock must not collect live
 * domains to invent one.
 */
export const LAB_ALLOWED_SOURCE_ID = "lab-legal-watch";
export const LAB_ALLOWED_DOMAIN = "lab-watch.example.invalid";

const LAB_EVIDENCE = "lab-fixture:ATB-764-LAB";
const REVIEWED_ON = "2026-09-20";
const CONFIRMED_AT = "2026-09-20T03:00:00.000Z";

function allowedWatchUrl(itemId: string): string {
  return `https://${LAB_ALLOWED_DOMAIN}/watch/${itemId}`;
}

function provenance(
  decision: ExploreFixtureItem["source"]["decision"],
  sourceId: string,
  domain: string,
  labelJa: string,
  watchUrl: string | null
): ExploreFixtureItem["source"] {
  return {
    id: sourceId,
    labelJa,
    domain,
    decision,
    reviewedOn: REVIEWED_ON,
    confirmedAt: CONFIRMED_AT,
    evidence: LAB_EVIDENCE,
    watchUrl
  };
}

/**
 * Deterministic catalog. Titles, people, studios, and URLs are lab fixtures.
 * No live-domain collection. Japanese names are canonical; romaji is secondary.
 */
export const EXPLORE_FILTER_FIXTURES: ExploreFixtureItem[] = [
  {
    id: "lab-ef-01",
    titleJa: "ATB-764 湖畔の記録",
    titleRomaji: "Kohan no Kiroku",
    year: 2012,
    region: "JP",
    availability: "flatrate",
    studio: { nameJa: "ラボスタジオ北", nameRomaji: "Lab Studio Kita" },
    staff: [
      {
        nameJa: "高橋 葵",
        nameRomaji: "Takahashi Aoi",
        roleJa: "監督",
        roleRomaji: "Kantoku"
      }
    ],
    source: provenance(
      "allowed",
      LAB_ALLOWED_SOURCE_ID,
      LAB_ALLOWED_DOMAIN,
      "Lab Watch（フィクスチャ）",
      allowedWatchUrl("lab-ef-01")
    )
  },
  {
    id: "lab-ef-02",
    titleJa: "ATB-764 冬の手仕事",
    titleRomaji: "Fuyu no Teshigoto",
    year: 1998,
    region: "JP",
    availability: "rent",
    studio: { nameJa: "ラボスタジオ南", nameRomaji: "Lab Studio Minami" },
    staff: [
      {
        nameJa: "佐藤 律",
        nameRomaji: "Sato Ritsu",
        roleJa: "監督",
        roleRomaji: "Kantoku"
      }
    ],
    source: provenance(
      "allowed",
      LAB_ALLOWED_SOURCE_ID,
      LAB_ALLOWED_DOMAIN,
      "Lab Watch（フィクスチャ）",
      allowedWatchUrl("lab-ef-02")
    )
  },
  {
    id: "lab-ef-03",
    titleJa: "ATB-764 街灯と航路",
    titleRomaji: "Gaito to Koro",
    year: 2024,
    region: "JP",
    availability: "buy",
    studio: { nameJa: "ラボスタジオ北", nameRomaji: "Lab Studio Kita" },
    staff: [
      {
        nameJa: "井上 紬",
        nameRomaji: "Inoue Tsumugi",
        roleJa: "脚本",
        roleRomaji: "Kyakuhon"
      }
    ],
    source: provenance(
      "allowed",
      LAB_ALLOWED_SOURCE_ID,
      LAB_ALLOWED_DOMAIN,
      "Lab Watch（フィクスチャ）",
      allowedWatchUrl("lab-ef-03")
    )
  },
  {
    id: "lab-ef-04",
    titleJa: "ATB-764 橋の下の合唱",
    titleRomaji: "Hashi no Shita no Gassho",
    year: 2016,
    region: "JP",
    availability: "flatrate",
    studio: { nameJa: "ラボスタジオ北", nameRomaji: "Lab Studio Kita" },
    staff: [
      {
        nameJa: "高橋 葵",
        nameRomaji: "Takahashi Aoi",
        roleJa: "監督",
        roleRomaji: "Kantoku"
      }
    ],
    source: provenance(
      "allowed",
      LAB_ALLOWED_SOURCE_ID,
      LAB_ALLOWED_DOMAIN,
      "Lab Watch（フィクスチャ）",
      allowedWatchUrl("lab-ef-04")
    )
  },
  {
    id: "lab-ef-05",
    titleJa: "ATB-764 未確認の配信",
    titleRomaji: "Mikakunin no Haishin",
    year: 2018,
    region: "JP",
    availability: "unavailable",
    studio: { nameJa: "ラボスタジオ西", nameRomaji: "Lab Studio Nishi" },
    staff: [
      {
        nameJa: "山本 次郎",
        nameRomaji: "Yamamoto Jiro",
        roleJa: "音楽",
        roleRomaji: "Ongaku"
      }
    ],
    source: provenance(
      "unknown",
      "lab-unknown-source",
      "unknown-official.example.invalid",
      "不明ソース（フィクスチャ）",
      null
    )
  },
  {
    id: "lab-ef-06",
    titleJa: "ATB-764 許諾待ちの公式",
    titleRomaji: "Kyodaku Machi no Koshiki",
    year: 2005,
    region: "JP",
    availability: "unavailable",
    studio: { nameJa: "ラボスタジオ東", nameRomaji: "Lab Studio Higashi" },
    staff: [
      {
        nameJa: "森本 楓",
        nameRomaji: "Morimoto Kaede",
        roleJa: "キャラクターデザイン",
        roleRomaji: "Character Design"
      }
    ],
    source: provenance(
      "permission-required",
      "lab-permission-required",
      "permission-required.example.invalid",
      "許諾が必要なソース（フィクスチャ）",
      null
    )
  },
  {
    id: "lab-ef-07",
    titleJa: "ATB-764 地域外の配信",
    titleRomaji: "Chiiki-gai no Haishin",
    year: 1992,
    region: "US",
    availability: "flatrate",
    studio: { nameJa: "ラボスタジオ南", nameRomaji: "Lab Studio Minami" },
    staff: [
      {
        nameJa: "佐藤 律",
        nameRomaji: "Sato Ritsu",
        roleJa: "監督",
        roleRomaji: "Kantoku"
      }
    ],
    source: provenance(
      "allowed",
      LAB_ALLOWED_SOURCE_ID,
      LAB_ALLOWED_DOMAIN,
      "Lab Watch（フィクスチャ）",
      null
    )
  }
];

export const EMPTY_FILTER_COMBO = {
  availability: "legal",
  decade: "1990s",
  studio: "ラボスタジオ北",
  staff: "井上 紬｜脚本"
} as const;
