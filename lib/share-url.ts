export type ShareOutcome = "shared" | "copied" | "none";

/**
 * 共有URLをできるだけ「ライト」に共有する。
 * - 対応ブラウザ(主にモバイル)では OS のネイティブ共有シート(navigator.share)を開く。
 * - 非対応(主にデスクトップ)ではクリップボードへコピーしてフォールバック。
 * 戻り値で UI 側がメッセージを出し分けられる。
 */
export async function shareOrCopyUrl(input: {
  url: string;
  title?: string;
  text?: string;
}): Promise<ShareOutcome> {
  const { url, title, text } = input;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (error) {
      // ユーザーがシートを閉じた場合は何もしない（URL自体は画面に残す）。
      if (error instanceof Error && error.name === "AbortError") {
        return "none";
      }
      // それ以外の失敗はクリップボードへフォールバック。
    }
  }

  try {
    await navigator.clipboard?.writeText(url);
    return "copied";
  } catch {
    return "none";
  }
}
