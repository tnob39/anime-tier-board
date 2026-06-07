import type { AnimeTitleSet } from "../types";

export function pickDisplayTitle(titles: AnimeTitleSet): string {
  return (
    cleanTitle(titles.native) ??
    cleanTitle(titles.userPreferred) ??
    cleanTitle(titles.romaji) ??
    cleanTitle(titles.english) ??
    "Untitled"
  );
}

export function proxiedImageUrl(imageUrl: string): string {
  return imageUrl;
}

function cleanTitle(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
