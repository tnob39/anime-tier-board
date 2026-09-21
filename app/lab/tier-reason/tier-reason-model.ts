export const LAB_TIER_REASON_PATH = "/lab/tier-reason";
export const REASON_MAX_LENGTH = 140;
export const FIXTURE_SAVE_DELAY_MS = 400;

export type LabDisplayMode = "visual" | "simple";
export type Visibility = "private" | "shared";
export type SpoilerState = "unspecified" | "has_spoiler" | "no_spoiler";
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type CreatorSource = {
  nameJa: string;
  roleJa: string;
  sourceLabel: string;
  recordedAt: string;
  region: string;
};

export type LabAnimeFixture = {
  id: "sourced" | "unsourced";
  titleJa: string;
  titleRomaji: string;
  tier: "S" | "A" | "B" | "C" | "D";
  creator: CreatorSource | null;
};

export type SavedReason = {
  text: string | null;
  spoiler: SpoilerState;
  visibility: Visibility;
  savedAt: string;
};

export type PendingSave = {
  rawReason: string;
  spoiler: SpoilerState;
  visibility: Visibility;
  failNext: boolean;
};

export const REASON_HINT_ID = "lab-tr-reason-hint";
export const REASON_COUNT_ID = "lab-tr-reason-count";
export const REASON_ERROR_ID = "lab-tr-reason-error";

export type SaveOutcome =
  | { ok: true; saved: SavedReason }
  | { ok: false; error: string };

export const COPY = {
  kicker: "Lab",
  title: "理由付き評価",
  lead:
    "Tier配置のあと、任意の短い理由を残せます。入力しなくても完了できます。本文はあなたの原文のまま保存し、AIは補完・要約・美化しません。",
  modeLegend: "表示モード",
  modeVisual: "Visual",
  modeSimple: "Simple",
  cultureHeading: "文化循環チェック",
  fixtureLabel: "作品フィクスチャ",
  tierLabel: "配置Tier",
  posterLabel: "のキービジュアル（フィクスチャ）",
  reasonLabel: "評価の理由（任意）",
  reasonHint:
    "入力した原文のまま保存します。AIによる補完・要約・美化はしません。",
  reasonPlaceholder: "好きな理由を短く書けます（任意）",
  overLimit: "140文字以内にしてください。",
  spoilerLegend: "ネタバレ",
  spoilerUnspecified: "未指定（共有面では本文を伏せる）",
  spoilerYes: "ネタバレあり",
  spoilerNo: "ネタバレなし",
  visibilityLegend: "公開範囲",
  visibilityPrivate: "非公開（既定）",
  visibilityShared: "共有する（明示）",
  failNext: "次の保存を失敗させる（検証用）",
  save: "保存する",
  saving: "保存中…",
  retry: "再試行",
  savingStatus: "保存しています…",
  savedWithReason: "理由を保存しました。",
  savedWithoutReason: "理由なしで保存しました。",
  saveFailed: "保存に失敗しました。再試行できます。",
  sharePreviewHeading: "共有プレビュー",
  shareHiddenPrivate: "非公開のため表示しません",
  shareHiddenSpoiler: "ネタバレのため本文を伏せています",
  shareHiddenEmpty: "理由は保存されていません",
  savedOriginalHeading: "保存した原文",
  savedOriginalNone: "（なし）",
  nextHeading: "次の一手",
  nextUnavailable: "作り手は確認できません",
  nextUnavailableHint: "出典が不足しているため、作り手は表示しません。",
  metricLabel: "Meaningful Rating Rate",
  metricHint: "Tier配置後、本人の理由が保存された率。本文とユーザーIDは送りません。",
  noAi: "AIによる補完・要約・美化はしません。",
} as const;

export const LAB_ANIME_FIXTURES: Record<LabAnimeFixture["id"], LabAnimeFixture> = {
  sourced: {
    id: "sourced",
    titleJa: "葬送のフリーレン",
    titleRomaji: "Sousou no Frieren",
    tier: "A",
    creator: {
      nameJa: "マッドハウス",
      roleJa: "スタジオ",
      sourceLabel: "公式クレジット（フィクスチャ）",
      recordedAt: "2026-09-20",
      region: "JP",
    },
  },
  unsourced: {
    id: "unsourced",
    titleJa: "出典確認前の作品",
    titleRomaji: "",
    tier: "B",
    creator: null,
  },
};

export const CULTURE_CYCLE_CHECKS = [
  {
    id: "loop",
    label: "ループ",
    result: "理由付き評価の次の一手は、出典付き作り手を1件見ることだけです。",
  },
  {
    id: "source",
    label: "出典",
    result: "ユーザー原文が正本です。AI解説を一次情報にしません。出典が無ければ作り手を断定しません。",
  },
  {
    id: "canon",
    label: "原典",
    result: "日本語の作品名・スタジオ名をcanonicalとし、ローマ字は併記だけです。",
  },
  {
    id: "rating",
    label: "評価",
    result: "理由は任意。非公開が既定。ネタバレは本人指定。未指定時は共有面で本文を伏せます。",
  },
  {
    id: "legal",
    label: "正規視聴",
    result: "このlabでは配信CTAを出さず、非正規リンクも置きません。",
  },
  {
    id: "metric",
    label: "指標",
    result: "Meaningful Rating Rate（Tier配置後に本人理由が保存された率）だけを動かします。",
  },
  {
    id: "ia",
    label: "既存IA",
    result: "/lab の独立モックです。本番 /tier とナビは変更しません。",
  },
  {
    id: "access",
    label: "アクセス",
    result: "320–430px と desktop、44px、キーボード、可視フォーカス、reduced-motion を維持します。",
  },
] as const;

export function normalizeReason(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function isReasonOverLimit(raw: string): boolean {
  return raw.length > REASON_MAX_LENGTH;
}

export function canSubmitReason(raw: string): boolean {
  return !isReasonOverLimit(raw);
}

export function fieldsLocked(status: SaveStatus): boolean {
  return status === "saving";
}

export function restoreTextControl(
  target: { value: string },
  canonical: string
): void {
  if (target.value !== canonical) {
    target.value = canonical;
  }
}

export function restoreRadioGroup(
  inputs: ArrayLike<{ value: string; checked: boolean }>,
  canonical: string
): void {
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const shouldCheck = input.value === canonical;
    if (input.checked !== shouldCheck) {
      input.checked = shouldCheck;
    }
  }
}

export function previewFromDraft(draft: {
  rawReason: string;
  spoiler: SpoilerState;
  visibility: Visibility;
}): { hidden: boolean; label: string; body: string | null } {
  return sharePreview({
    text: normalizeReason(draft.rawReason),
    spoiler: draft.spoiler,
    visibility: draft.visibility,
  });
}

export function reasonFieldAria(overLimit: boolean): {
  invalid: "true" | "false";
  describedBy: string;
  errorMessage: string | undefined;
} {
  if (overLimit) {
    return {
      invalid: "true",
      describedBy: `${REASON_HINT_ID} ${REASON_COUNT_ID} ${REASON_ERROR_ID}`,
      errorMessage: REASON_ERROR_ID,
    };
  }
  return {
    invalid: "false",
    describedBy: `${REASON_HINT_ID} ${REASON_COUNT_ID}`,
    errorMessage: undefined,
  };
}

export function primaryActionLabel(status: SaveStatus): string {
  if (status === "saving") return COPY.saving;
  if (status === "error") return COPY.retry;
  return COPY.save;
}

export function saveStatusMessage(
  status: SaveStatus,
  saved: SavedReason | null,
  error: string | null
): string | null {
  if (status === "saving") return COPY.savingStatus;
  if (status === "error") return error ?? COPY.saveFailed;
  if (status === "saved" && saved) {
    return saved.text ? COPY.savedWithReason : COPY.savedWithoutReason;
  }
  return null;
}

export function sharePreview(input: {
  text: string | null;
  spoiler: SpoilerState;
  visibility: Visibility;
}): { hidden: boolean; label: string; body: string | null } {
  if (input.visibility !== "shared") {
    return { hidden: true, label: COPY.shareHiddenPrivate, body: null };
  }
  if (!input.text) {
    return { hidden: true, label: COPY.shareHiddenEmpty, body: null };
  }
  if (input.spoiler !== "no_spoiler") {
    return { hidden: true, label: COPY.shareHiddenSpoiler, body: null };
  }
  return { hidden: false, label: COPY.savedOriginalHeading, body: input.text };
}

export function nextCreatorAction(creator: CreatorSource | null): {
  kind: "creator" | "unavailable";
  label: string;
  nameJa: string | null;
  sourceLabel: string | null;
} {
  if (!creator) {
    return {
      kind: "unavailable",
      label: COPY.nextUnavailable,
      nameJa: null,
      sourceLabel: null,
    };
  }
  return {
    kind: "creator",
    label: `${creator.roleJa}を見る`,
    nameJa: creator.nameJa,
    sourceLabel: creator.sourceLabel,
  };
}

export function meaningfulRatingRate(saves: SavedReason[]): {
  withReason: number;
  total: number;
} {
  return {
    withReason: saves.filter((item) => item.text !== null).length,
    total: saves.length,
  };
}

export function applyFixtureSave(args: {
  rawReason: string;
  spoiler: SpoilerState;
  visibility: Visibility;
  failNext: boolean;
  now?: string;
}): { failNext: boolean; status: Exclude<SaveStatus, "idle" | "saving">; result: SaveOutcome } {
  if (isReasonOverLimit(args.rawReason)) {
    return {
      failNext: args.failNext,
      status: "error",
      result: { ok: false, error: COPY.overLimit },
    };
  }
  if (args.failNext) {
    return {
      failNext: false,
      status: "error",
      result: { ok: false, error: COPY.saveFailed },
    };
  }
  return {
    failNext: false,
    status: "saved",
    result: {
      ok: true,
      saved: {
        text: normalizeReason(args.rawReason),
        spoiler: args.spoiler,
        visibility: args.visibility,
        savedAt: args.now ?? "2026-09-20T00:00:00.000Z",
      },
    },
  };
}
