export type CultureCycleCheck = {
  id: string;
  label: string;
  result: "該当" | "N/A";
  note: string;
};

/**
 * docs/UX_DIRECTION.md §1.8 文化循環チェックの Lab 記録。
 * このモックの範囲だけを記入する。本番 /explore は変更しない。
 */
export const CULTURE_CYCLE_CHECKS: CultureCycleCheck[] = [
  {
    id: "loop",
    label: "ループ",
    result: "該当",
    note: "選択結果の次の一手は正規視聴CTAの1つのみ。機能を並べて自己完結させない。"
  },
  {
    id: "legal-watch",
    label: "正規視聴",
    result: "該当",
    note: "許可済みフィクスチャ以外へは誘導しない。不明・許諾必要・地域外はリンクを出さない。"
  },
  {
    id: "canonical",
    label: "原典",
    result: "該当",
    note: "日本語タイトル・人名役職を canonical とし、ローマ字は併記に留める。"
  },
  {
    id: "creators",
    label: "作り手",
    result: "該当",
    note: "スタジオとスタッフを作品カードから隠さず、フィルタで辿れる。"
  },
  {
    id: "rating",
    label: "評価",
    result: "N/A",
    note: "本Labは探索フィルタのみ。Tier の優劣断定は扱わない。"
  },
  {
    id: "source",
    label: "出典",
    result: "該当",
    note: "各結果に判定・確認日時・対象地域を出す。AI解説を一次情報にしない。"
  },
  {
    id: "archive",
    label: "保存",
    result: "該当",
    note: "1990年代の旧作を年代フィルタで再発見できる。"
  },
  {
    id: "metric",
    label: "指標",
    result: "該当",
    note: "Creator Discovery Rate と Rediscovery Rate を動かす探索情報設計。"
  },
  {
    id: "ia",
    label: "既存 IA",
    result: "該当",
    note: "方針④の底部ナビは変更しない。本ページは /lab の独立モック。"
  },
  {
    id: "scope",
    label: "範囲",
    result: "該当",
    note: "実domain収集、DB、本番 /explore は非目標。フィクスチャのみ。"
  },
  {
    id: "access",
    label: "アクセス",
    result: "該当",
    note: "375px起点、44px以上、キーボード、可視フォーカス、reduced-motion。"
  }
];
