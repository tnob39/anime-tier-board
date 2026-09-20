/**
 * ATB-766-LAB fixture data.
 * Independent /lab mock — not production share data, not live provider lookup.
 */

export const LAB_CHECKED_AT = "2026-09-01T03:00:00.000Z";
export const LAB_AVAILABILITY_SOURCE = "tmdb-watch-providers";

/** Inline SVG so Visual has a poster without artwork HTTP. */
export const LAB_POSTER_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='240' viewBox='0 0 160 240'%3E%3Crect width='160' height='240' fill='%23212e2c'/%3E%3Crect x='16' y='16' width='128' height='208' fill='none' stroke='%232dd4bf' stroke-width='2'/%3E%3C/svg%3E";

export const LAB_SHARE_ANIME = {
  id: "lab-share-region-frieren",
  canonicalTitle: "葬送のフリーレン",
  translatedTitle: "Frieren: Beyond Journey's End",
  studio: "マッドハウス",
  spoiler:
    "ヒンメルはすでに他界しており、フリーレンの旅は彼の死を起点にする。",
} as const;

const NETFLIX_JP_HREF = "https://www.netflix.com/jp/";

export const LAB_REGION_ORDER = ["JP", "XX"] as const;
export type LabRegionId = (typeof LAB_REGION_ORDER)[number];

type LabRegionBase = {
  id: LabRegionId;
  label: string;
  source: typeof LAB_AVAILABILITY_SOURCE;
  region: string;
  checkedAt: typeof LAB_CHECKED_AT;
};

export type LabRegionFixture =
  | (LabRegionBase & {
      availability: "confirmed";
      provider: { name: string; href: string };
    })
  | (LabRegionBase & {
      availability: "unavailable";
      provider: null;
    });

export const LAB_REGIONS = {
  JP: {
    id: "JP",
    label: "日本",
    availability: "confirmed",
    source: LAB_AVAILABILITY_SOURCE,
    region: "JP",
    checkedAt: LAB_CHECKED_AT,
    provider: {
      name: "Netflix",
      href: NETFLIX_JP_HREF,
    },
  },
  XX: {
    id: "XX",
    label: "未確認地域",
    availability: "unavailable",
    source: LAB_AVAILABILITY_SOURCE,
    region: "XX",
    checkedAt: LAB_CHECKED_AT,
    provider: null,
  },
} as const satisfies Record<LabRegionId, LabRegionFixture>;

export const DEFAULT_LAB_REGION_ID: LabRegionId = "JP";

export const LAB_CULTURE_CYCLE_ITEMS = [
  {
    key: "loop",
    label: "ループ",
    text: "次の一手は受け取り地域の正規視聴（1つの主アクション）",
  },
  {
    key: "legal-watch",
    label: "正規視聴",
    text: "非正規へ誘導しない。確認できない地域は推測せず unavailable",
  },
  {
    key: "canonical",
    label: "原典",
    text: "日本語タイトルが canonical。英訳は併記し、上書きしない",
  },
  {
    key: "creator",
    label: "作り手",
    text: "スタジオ名を作品画像や配信名より隠さない",
  },
  {
    key: "rating",
    label: "評価",
    text: "優劣断定の順位競争にしない。ネタバレは既定で隠す",
  },
  {
    key: "source",
    label: "出典",
    text: "配信は source・region・checked-at を明示。不明なら断定しない",
  },
  {
    key: "persist",
    label: "保存",
    text: "今期流行だけでなく、作品単位の共有として残す",
  },
  {
    key: "metric",
    label: "指標",
    text: "Global Share Utility（共有先地域で有効な正規視聴を提示できたか）",
  },
  {
    key: "ia",
    label: "既存IA",
    text: "方針④のタブ構成は変更していない（/lab サンドボックス）",
  },
  {
    key: "scope",
    label: "範囲",
    text: "fixture のみ。API・DB・本番共有ルートは使わない",
  },
  {
    key: "access",
    label: "アクセス",
    text: "375px 起点、操作は 44px。キーボード・フォーカス・動き低減に対応",
  },
] as const;

export const LEGITIMATE_WATCH_HOSTS = ["www.netflix.com"] as const;
