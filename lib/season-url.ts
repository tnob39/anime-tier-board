import {
  equalSeasonRef,
  getCurrentAnimeSeason,
  normalizeSeason,
  parseSeasonPathParts,
  parseSeasonYear,
  SEASON_PATH_SLUG,
  type SeasonRef
} from "./season.ts";

export const SEASON_YEAR_QUERY_KEY = "year";
export const SEASON_QUERY_KEY = "season";

export const SEASON_CONTEXT_PATHS = [
  "/",
  "/tier",
  "/tier/impressions",
  "/explore",
  "/watchlist",
  "/dashboard"
] as const;

const SEASON_LANDING_PATH = /^\/seasons\/([^/]+)\/([^/]+)\/?$/;

export type SeasonQueryOptions = {
  allowYearOnly?: boolean;
};

export type SeasonQueryResolution = {
  ref: SeasonRef;
  current: SeasonRef;
  isCurrent: boolean;
  explicit: boolean;
  invalid: boolean;
  missing: boolean;
  yearScope: boolean;
};

export type SeasonUrlCanonicalize = SeasonQueryResolution & {
  search: string;
  didChange: boolean;
};

function readParam(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string
): string | null {
  if (source instanceof URLSearchParams) {
    return source.get(key);
  }
  const value = source[key];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function toSearchParams(
  source: URLSearchParams | Record<string, string | string[] | undefined>
): URLSearchParams {
  if (source instanceof URLSearchParams) {
    return new URLSearchParams(source.toString());
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
    } else if (value != null) {
      params.set(key, value);
    }
  }
  return params;
}

export function isSeasonContextPath(pathname: string): boolean {
  if (SEASON_CONTEXT_PATHS.includes(pathname as (typeof SEASON_CONTEXT_PATHS)[number])) {
    return true;
  }
  return SEASON_LANDING_PATH.test(pathname);
}

export function parseSeasonLandingPath(pathname: string): SeasonRef | null {
  const match = pathname.match(SEASON_LANDING_PATH);
  if (!match) {
    return null;
  }
  return parseSeasonPathParts(match[1], match[2]);
}

export function serializeSeasonQuery(ref: SeasonRef): string {
  const params = new URLSearchParams();
  params.set(SEASON_YEAR_QUERY_KEY, String(ref.year));
  params.set(SEASON_QUERY_KEY, ref.season);
  return params.toString();
}

export function serializeSeasonPath(ref: SeasonRef): string {
  return `/seasons/${ref.year}/${SEASON_PATH_SLUG[ref.season]}`;
}

export function withSeasonQuery(pathname: string, ref: SeasonRef | null): string {
  const [path, hash] = pathname.split("#");
  const hashSuffix = hash != null && pathname.includes("#") ? `#${hash}` : "";
  if (!ref) {
    return `${path}${hashSuffix}`;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${serializeSeasonQuery(ref)}${hashSuffix}`;
}

export function resolveSeasonQuery(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
  now = new Date(),
  options: SeasonQueryOptions = {}
): SeasonQueryResolution {
  const current = getCurrentAnimeSeason(now);
  const rawYear = readParam(source, SEASON_YEAR_QUERY_KEY);
  const rawSeason = readParam(source, SEASON_QUERY_KEY);
  const missing = rawYear == null && rawSeason == null;

  if (missing) {
    return {
      ref: current,
      current,
      isCurrent: true,
      explicit: false,
      invalid: false,
      missing: true,
      yearScope: false
    };
  }

  const year = parseSeasonYear(rawYear);
  const season = normalizeSeason(rawSeason);
  if (options.allowYearOnly && year != null && rawSeason == null) {
    const ref = { year, season: current.season };
    return {
      ref,
      current,
      isCurrent: equalSeasonRef(ref, current),
      explicit: true,
      invalid: false,
      missing: false,
      yearScope: true
    };
  }

  if (year == null || season == null) {
    return {
      ref: current,
      current,
      isCurrent: true,
      explicit: false,
      invalid: true,
      missing: false,
      yearScope: false
    };
  }

  const ref = { year, season };
  return {
    ref,
    current,
    isCurrent: equalSeasonRef(ref, current),
    explicit: true,
    invalid: false,
    missing: false,
    yearScope: false
  };
}

export function canonicalizeSeasonSearchParams(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
  now = new Date(),
  options: SeasonQueryOptions = {}
): SeasonUrlCanonicalize {
  const params = toSearchParams(source);
  const resolved = resolveSeasonQuery(params, now, options);
  const before = params.toString();

  if (resolved.invalid || !resolved.explicit) {
    params.delete(SEASON_YEAR_QUERY_KEY);
    params.delete(SEASON_QUERY_KEY);
  } else if (resolved.yearScope) {
    params.set(SEASON_YEAR_QUERY_KEY, String(resolved.ref.year));
    params.delete(SEASON_QUERY_KEY);
  } else {
    params.set(SEASON_YEAR_QUERY_KEY, String(resolved.ref.year));
    params.set(SEASON_QUERY_KEY, resolved.ref.season);
  }

  const search = params.toString();
  return {
    ...resolved,
    search,
    didChange: search !== before
  };
}

export function applySeasonQuery(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
  ref: SeasonRef | null
): string {
  const params = toSearchParams(source);
  if (!ref) {
    params.delete(SEASON_YEAR_QUERY_KEY);
    params.delete(SEASON_QUERY_KEY);
  } else {
    params.set(SEASON_YEAR_QUERY_KEY, String(ref.year));
    params.set(SEASON_QUERY_KEY, ref.season);
  }
  return params.toString();
}

export type SeasonRefPatch = {
  year?: number;
  season?: SeasonRef["season"];
};

export function mergeSeasonPatch(canonical: SeasonRef, patch: SeasonRefPatch): SeasonRef {
  return {
    year: patch.year ?? canonical.year,
    season: patch.season ?? canonical.season
  };
}

export function buildSeasonHref(
  pathname: string,
  search: string | URLSearchParams,
  ref: SeasonRef | null,
  hash = ""
): string {
  const query = applySeasonQuery(
    typeof search === "string" ? new URLSearchParams(search.replace(/^\?/, "")) : search,
    ref
  );
  const hashSuffix = hash
    ? hash.startsWith("#")
      ? hash
      : `#${hash}`
    : "";
  return `${pathname}${query ? `?${query}` : ""}${hashSuffix}`;
}

export function readSeasonContextFromLocation(
  pathname: string,
  search: URLSearchParams | Record<string, string | string[] | undefined>,
  now = new Date(),
  options: SeasonQueryOptions = {}
): SeasonRef | null {
  const fromPath = parseSeasonLandingPath(pathname);
  if (fromPath) {
    return fromPath;
  }
  const resolved = resolveSeasonQuery(search, now, options);
  if (resolved.explicit && !resolved.invalid) {
    return resolved.ref;
  }
  return null;
}

export function seasonAwareHref(
  href: string,
  pathname: string,
  search: URLSearchParams | Record<string, string | string[] | undefined>,
  now = new Date()
): string {
  if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) {
    return href;
  }
  const url = new URL(href, "https://season.invalid");
  if (!isSeasonContextPath(url.pathname)) {
    return href;
  }
  const context = readSeasonContextFromLocation(pathname, search, now);
  if (!context) {
    return href;
  }
  if (url.pathname.startsWith("/seasons/")) {
    return `${serializeSeasonPath(context)}${url.search}${url.hash}`;
  }
  url.searchParams.set(SEASON_YEAR_QUERY_KEY, String(context.year));
  url.searchParams.set(SEASON_QUERY_KEY, context.season);
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}

export function buildSeasonPageHref(
  pathname: string,
  search: URLSearchParams | Record<string, string | string[] | undefined>,
  ref: SeasonRef | null
): string {
  const query = applySeasonQuery(search, ref);
  return query ? `${pathname}?${query}` : pathname;
}
