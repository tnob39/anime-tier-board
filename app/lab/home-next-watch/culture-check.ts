export type CultureCheckResult = "pass" | "na";

export type CultureCycleCheck = {
  id: string;
  label: string;
  result: CultureCheckResult;
  note: string;
};

/** UX_DIRECTION.md §1.8 文化循環チェック — この Lab スライス向けの可視記録。 */
export const CULTURE_CYCLE_CHECKS: readonly CultureCycleCheck[] = [
  {
    id: "loop",
    label: "ループ",
    result: "pass",
    note: "今夜の1本を選び、正規配信へ進む次の一手だけを示す"
  },
  {
    id: "legal-watch",
    label: "正規視聴",
    result: "pass",
    note: "未確認時は視聴リンクを出さない。地域は日本（JP）"
  },
  {
    id: "canonical",
    label: "原典",
    result: "pass",
    note: "日本語タイトルを canonical として表示する"
  },
  {
    id: "creators",
    label: "作り手",
    result: "pass",
    note: "確認済み作品はスタジオ名を配信名と並べて示す。未確認は断定しない"
  },
  {
    id: "rating",
    label: "評価",
    result: "na",
    note: "本LabはTier評価を扱わない"
  },
  {
    id: "source",
    label: "出典",
    result: "pass",
    note: "出典・地域・確認日時を常時表示し、未確認は断定しない"
  },
  {
    id: "preserve",
    label: "保存",
    result: "na",
    note: "本Labは新作専用導線を増やさない"
  },
  {
    id: "metric",
    label: "指標",
    result: "pass",
    note: "Legal Watch-through（正規視聴遷移）"
  },
  {
    id: "ia",
    label: "既存 IA",
    result: "pass",
    note: "本番ナビを変更せず /lab に閉じる"
  },
  {
    id: "scope",
    label: "範囲",
    result: "pass",
    note: "フィクスチャのみ。API・DB・本番ルートは変更しない"
  },
  {
    id: "access",
    label: "アクセス",
    result: "pass",
    note: "320–430px 起点、44px タップ、キーボード、フォーカス、動き軽減"
  }
];
