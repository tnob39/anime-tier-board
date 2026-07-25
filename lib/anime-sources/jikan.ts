import type { AnimeItem, AnimeSeason, JikanOutcome } from "../types.ts";
import { pickDisplayTitle, proxiedImageUrl } from "./shared.ts";

export const JIKAN_ENDPOINT = "https://api.jikan.moe/v4/seasons";
export const JIKAN_HOST = "api.jikan.moe";
export const JIKAN_MAX_PAGES = 5;
export const JIKAN_ATTEMPT_BUDGET_MS = 6000;

/** Inclusive start of post-cutoff regime (SSOT §1). Enforced inside this client. */
export const JIKAN_CUTOFF_MS = Date.parse("2026-09-15T00:00:00.000Z");

type JikanAnime = {
  mal_id: number;
  url?: string | null;
  images?: {
    webp?: {
      large_image_url?: string | null;
      image_url?: string | null;
    };
    jpg?: {
      large_image_url?: string | null;
      image_url?: string | null;
    };
  };
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  titles?: Array<{
    type?: string | null;
    title?: string | null;
  }>;
  type?: string | null;
  episodes?: number | null;
  season?: string | null;
  year?: number | null;
  score?: number | null;
  scored_by?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  rank?: number | null;
  genres?: JikanNamedResource[];
  explicit_genres?: JikanNamedResource[];
  themes?: JikanNamedResource[];
  studios?: JikanNamedResource[];
  broadcast?: {
    day?: string | null;
    time?: string | null;
    timezone?: string | null;
    string?: string | null;
  } | null;
  aired?: {
    from?: string | null;
  } | null;
};

type JikanNamedResource = {
  mal_id?: number | null;
  name?: string | null;
  url?: string | null;
};

type JikanResponse = {
  data?: JikanAnime[];
  pagination?: {
    has_next_page?: boolean;
  };
};

const jikanSeasonMap: Record<AnimeSeason, string> = {
  WINTER: "winter",
  SPRING: "spring",
  SUMMER: "summer",
  FALL: "fall"
};

export type JikanAttemptOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  /**
   * Frozen request context time (epoch ms). Cutoff authorization uses this value,
   * not wall clock at each page, so mid-attempt clock advance cannot re-open network.
   */
  requestTimeMs: number;
  /** Absolute deadline (epoch ms) for the logical attempt wall budget. */
  deadlineMs: number;
  maxPages?: number;
  signal?: AbortSignal;
  /** Optional inter-page delay (default 350ms). Tests may set 0. */
  pageDelayMs?: number;
};

export type JikanAttemptSuccess = {
  ok: true;
  items: AnimeItem[];
  outcome: "success";
  pagesUsed: number;
};

export type JikanAttemptFailure = {
  ok: false;
  items: AnimeItem[];
  outcome: Extract<JikanOutcome, "error" | "disabled">;
  error: Error;
  pagesUsed: number;
};

export type JikanAttemptResult = JikanAttemptSuccess | JikanAttemptFailure;

/**
 * One logical Jikan seasonal attempt.
 * Authorization is not caller-controlled: when requestTimeMs >= JIKAN_CUTOFF_MS,
 * returns outcome=disabled with absolutely zero outbound HTTP requests.
 * Never returns partial success when the page cap is hit mid-walk.
 */
export async function fetchJikanSeasonalAnime(
  year: number,
  season: AnimeSeason,
  options: JikanAttemptOptions
): Promise<JikanAttemptResult> {
  // Inclusive cutoff: exact-cutoff and after → zero host requests (server-enforced).
  if (options.requestTimeMs >= JIKAN_CUTOFF_MS) {
    return {
      ok: false,
      items: [],
      outcome: "disabled",
      error: new Error("Jikan network is disabled at or after cutoff"),
      pagesUsed: 0
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? Date.now;
  const maxPages = options.maxPages ?? JIKAN_MAX_PAGES;
  const pageDelayMs = options.pageDelayMs ?? 350;
  const items: AnimeItem[] = [];
  let pagesUsed = 0;
  const seasonSlug = jikanSeasonMap[season];
  /** Once true, block further pagination, sleeps, and result processing. */
  let attemptClosed = false;

  const fail = (error: Error): JikanAttemptFailure => {
    attemptClosed = true;
    return {
      ok: false,
      items: [],
      outcome: "error",
      error,
      pagesUsed
    };
  };

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      if (attemptClosed || now() >= options.deadlineMs) {
        return fail(new Error("Jikan attempt exceeded 6s wall budget"));
      }

      if (options.signal?.aborted) {
        return fail(new Error("Jikan attempt aborted"));
      }

      const url = new URL(`${JIKAN_ENDPOINT}/${year}/${seasonSlug}`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", "25");

      let response: Response;
      try {
        response = await raceFetchAgainstDeadline(
          (signal) =>
            fetchImpl(url, {
              headers: {
                Accept: "application/json"
              },
              cache: "no-store",
              signal
            }),
          {
            now,
            deadlineMs: options.deadlineMs,
            parentSignal: options.signal
          }
        );
      } catch (error) {
        if (isAbortError(error) || isDeadlineError(error) || now() >= options.deadlineMs) {
          return fail(new Error("Jikan attempt exceeded 6s wall budget"));
        }
        return fail(toError(error));
      }

      if (attemptClosed || now() >= options.deadlineMs) {
        return fail(new Error("Jikan attempt exceeded 6s wall budget"));
      }

      pagesUsed += 1;

      if (!response.ok) {
        return fail(new Error(`Jikan request failed: ${response.status}`));
      }

      let payload: JikanResponse;
      try {
        payload = (await response.json()) as JikanResponse;
      } catch {
        return fail(new Error("Jikan response is not valid JSON"));
      }

      if (attemptClosed || now() >= options.deadlineMs) {
        return fail(new Error("Jikan attempt exceeded 6s wall budget"));
      }

      const data = payload.data ?? [];
      if (!Array.isArray(payload.data) && payload.data !== undefined) {
        return fail(new Error("Jikan response data is malformed"));
      }

      for (const entry of data) {
        const imageUrl =
          entry.images?.webp?.large_image_url ??
          entry.images?.webp?.image_url ??
          entry.images?.jpg?.large_image_url ??
          entry.images?.jpg?.image_url;

        if (!imageUrl) {
          continue;
        }

        const titles = {
          native:
            entry.title_japanese ??
            entry.titles?.find((title) => title.type === "Japanese")?.title,
          userPreferred: entry.title,
          romaji: entry.titles?.find((title) => title.type === "Default")?.title,
          english: entry.title_english
        };

        items.push({
          id: `jikan-${entry.mal_id}`,
          source: "jikan",
          title: pickDisplayTitle(titles),
          titles,
          imageUrl,
          proxiedImageUrl: proxiedImageUrl(imageUrl),
          siteUrl: entry.url ?? `https://myanimelist.net/anime/${entry.mal_id}`,
          format: entry.type,
          season: entry.season,
          seasonYear: entry.year,
          episodes: entry.episodes,
          score: entry.score,
          popularity: entry.popularity,
          reputation: {
            score: entry.score,
            scoreMax: 10,
            scoredBy: entry.scored_by,
            popularity: entry.popularity,
            members: entry.members,
            favourites: entry.favorites,
            rank: entry.rank
          },
          genres: cleanStringList(
            [
              ...(entry.genres ?? []),
              ...(entry.explicit_genres ?? []),
              ...(entry.themes ?? [])
            ].map((genre) => genre.name)
          ),
          studios: (entry.studios ?? [])
            .map((studio) => ({
              id: studio.mal_id,
              name: studio.name?.trim() ?? "",
              siteUrl: studio.url
            }))
            .filter((studio) => studio.name.length > 0),
          airing: {
            startDate: entry.aired?.from ?? null,
            broadcastDay: entry.broadcast?.day ?? null,
            broadcastTime: entry.broadcast?.time ?? null,
            broadcastTimezone: entry.broadcast?.timezone ?? null,
            broadcastText: entry.broadcast?.string ?? null,
            courEstimate: estimateCour(entry.episodes)
          },
          isRebroadcast: isLikelyRebroadcast(entry),
          streamingEpisodes: [],
          streamingPlatforms: []
        });
      }

      const hasNext = Boolean(payload.pagination?.has_next_page) && data.length > 0;
      if (!hasNext) {
        break;
      }

      if (page === maxPages) {
        return fail(
          new Error(
            `Jikan attempt exceeded ${maxPages} HTTP page cap before complete set`
          )
        );
      }

      if (pageDelayMs > 0) {
        if (attemptClosed || now() >= options.deadlineMs) {
          return fail(new Error("Jikan attempt exceeded 6s wall budget"));
        }
        try {
          await sleep(pageDelayMs, now, options.deadlineMs);
        } catch {
          return fail(new Error("Jikan attempt exceeded 6s wall budget"));
        }
        if (attemptClosed || now() >= options.deadlineMs) {
          return fail(new Error("Jikan attempt exceeded 6s wall budget"));
        }
      }
    }
  } catch (error) {
    if (isAbortError(error) || isDeadlineError(error) || now() >= options.deadlineMs) {
      return fail(new Error("Jikan attempt exceeded 6s wall budget"));
    }
    return fail(toError(error));
  }

  if (attemptClosed || now() >= options.deadlineMs) {
    return fail(new Error("Jikan attempt exceeded 6s wall budget"));
  }

  const deduped = dedupeById(items);
  if (deduped.length === 0) {
    return fail(new Error("Jikan returned no seasonal anime"));
  }

  attemptClosed = true;
  return {
    ok: true,
    items: deduped,
    outcome: "success",
    pagesUsed
  };
}

/**
 * Race a fetch against the absolute logical-attempt deadline even when the
 * underlying fetch implementation ignores AbortSignal. Aborts at expiry and
 * always clears the timer in finally.
 */
async function raceFetchAgainstDeadline(
  work: (signal: AbortSignal) => Promise<Response>,
  runtime: {
    now: () => number;
    deadlineMs: number;
    parentSignal?: AbortSignal;
  }
): Promise<Response> {
  if (runtime.now() >= runtime.deadlineMs) {
    throw new DeadlineError("Jikan attempt exceeded 6s wall budget");
  }
  if (runtime.parentSignal?.aborted) {
    throw new DeadlineError("Jikan attempt aborted");
  }

  const controller = new AbortController();
  const remaining = Math.max(0, runtime.deadlineMs - runtime.now());
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onParentAbort = () => {
    controller.abort();
  };
  runtime.parentSignal?.addEventListener("abort", onParentAbort);

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new DeadlineError("Jikan attempt exceeded 6s wall budget"));
      }, remaining);
    });

    return await Promise.race([work(controller.signal), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    runtime.parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

class DeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadlineError";
  }
}

function isDeadlineError(error: unknown): boolean {
  return error instanceof DeadlineError;
}

function isLikelyRebroadcast(entry: JikanAnime): boolean {
  const combinedText = [
    entry.title,
    entry.title_english,
    entry.title_japanese,
    ...(entry.titles ?? []).map((title) => title.title),
    entry.broadcast?.string
  ]
    .filter(Boolean)
    .join(" ");

  return /再放送|再配信|rerun|rebroadcast|re-air/i.test(combinedText);
}

function cleanStringList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) {
      continue;
    }

    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
  }

  return result;
}

function sleep(
  ms: number,
  now: () => number,
  deadlineMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const remaining = deadlineMs - now();
    if (remaining <= 0) {
      reject(new DeadlineError("Jikan attempt exceeded 6s wall budget"));
      return;
    }
    const delay = Math.min(ms, remaining);
    const timer = setTimeout(() => {
      if (now() >= deadlineMs) {
        reject(new DeadlineError("Jikan attempt exceeded 6s wall budget"));
        return;
      }
      resolve();
    }, delay);
    // If remaining is shorter than ms, wake at remaining and fail if past deadline.
    void timer;
  });
}

function estimateCour(episodes?: number | null): string | null {
  if (typeof episodes !== "number" || episodes <= 0) {
    return null;
  }

  if (episodes <= 13) {
    return "1クール";
  }

  if (episodes <= 26) {
    return "2クール";
  }

  if (episodes <= 39) {
    return "3クール";
  }

  return "4クール以上";
}

function dedupeById(items: AnimeItem[]): AnimeItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
