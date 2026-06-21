import { API_BASE } from '@/lib/api-base';
import { isBoardState, type BoardState } from '@/lib/board';
import { isViewingStatus, type AnimeStatusRecord } from '@/lib/statuses';
import type { AnimeItem, AnimeSeason, AnimeSourceName } from '@/lib/types';

export class SessionExpiredError extends Error {
  constructor(message = 'セッションが期限切れです。再ログインしてください。') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

type ApiErrorBody = {
  error?: string;
  message?: string;
};

export type ApiFetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export type SaveRemoteBoardOptions = {
  expectedUpdatedAt?: string | null;
  signal?: AbortSignal;
  onUnauthorized?: () => void;
};

export type SaveRemoteBoardResult =
  | { ok: true }
  | { ok: false; conflict: true };

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 400;

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorMessage(parsed: unknown, fallback: string): string {
  if (typeof parsed === 'object' && parsed !== null) {
    const body = parsed as ApiErrorBody;
    if (typeof body.error === 'string') {
      return body.error;
    }
    if (typeof body.message === 'string') {
      return body.message;
    }
  }

  return fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function linkAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }

    signal.addEventListener(
      'abort',
      () => controller.abort(signal.reason),
      { once: true }
    );
  }

  return controller.signal;
}

function shouldRetryResponse(response: Response): boolean {
  return response.status >= 500 || response.status === 429;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}

function shouldRetryError(error: unknown): boolean {
  if (error instanceof SessionExpiredError || isAbortError(error)) {
    return false;
  }

  return true;
}

function isAnimeItem(value: unknown): value is AnimeItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as AnimeItem;
  return (
    typeof item.id === 'string' &&
    (item.source === 'anilist' || item.source === 'jikan') &&
    typeof item.title === 'string' &&
    typeof item.imageUrl === 'string' &&
    typeof item.proxiedImageUrl === 'string' &&
    typeof item.siteUrl === 'string'
  );
}

function isAnimeStatusRecord(value: unknown): value is AnimeStatusRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as AnimeStatusRecord;
  return (
    typeof record.animeId === 'string' &&
    isViewingStatus(record.status) &&
    typeof record.updatedAt === 'string' &&
    (record.anime === null || isAnimeItem(record.anime))
  );
}

function parseStatusesResponse(parsed: unknown): AnimeStatusRecord[] {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ステータス取得の応答形式が不正です。');
  }

  const statuses = (parsed as { statuses?: unknown }).statuses;
  if (!Array.isArray(statuses)) {
    return [];
  }

  return statuses.filter(isAnimeStatusRecord);
}

function parseSeasonalResponse(parsed: unknown): SeasonalApiResponse {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('季節アニメ取得の応答形式が不正です。');
  }

  const payload = parsed as Partial<SeasonalApiResponse>;
  if (
    typeof payload.year !== 'number' ||
    typeof payload.season !== 'string' ||
    !Array.isArray(payload.items) ||
    (payload.source !== 'anilist' && payload.source !== 'jikan')
  ) {
    throw new Error('季節アニメ取得の応答形式が不正です。');
  }

  return {
    year: payload.year,
    season: payload.season as AnimeSeason,
    items: payload.items.filter(isAnimeItem),
    source: payload.source as AnimeSourceName,
    cached: Boolean(payload.cached),
    warning: typeof payload.warning === 'string' ? payload.warning : undefined,
    enrichWarning:
      typeof payload.enrichWarning === 'string' ? payload.enrichWarning : undefined,
    error: typeof payload.error === 'string' ? payload.error : undefined,
  };
}

export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
  token?: string | null,
  onUnauthorized?: () => void
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    signal: externalSignal,
    ...requestInit
  } = options;

  const headers = new Headers(requestInit.headers);
  headers.set('Accept', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (requestInit.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = externalSignal
      ? linkAbortSignals(externalSignal, timeoutController.signal)
      : timeoutController.signal;

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...requestInit,
        headers,
        signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        onUnauthorized?.();
        throw new SessionExpiredError();
      }

      if (response.ok || !shouldRetryResponse(response) || attempt === retries) {
        return response;
      }

      lastError = new Error(`API request failed (${response.status})`);
    } catch (error) {
      clearTimeout(timeoutId);

      if (externalSignal?.aborted) {
        throw error;
      }

      if (!shouldRetryError(error) || attempt === retries) {
        throw error;
      }

      lastError = error;
    }

    await delay(retryDelayMs * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error('API request failed.');
}

export async function fetchStatuses(
  token: string,
  onUnauthorized?: () => void,
  signal?: AbortSignal
): Promise<AnimeStatusRecord[]> {
  const response = await apiFetch(
    '/api/statuses',
    { method: 'GET', signal },
    token,
    onUnauthorized
  );
  const parsed = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(parsed, `ステータス取得に失敗しました (${response.status})`));
  }

  return parseStatusesResponse(parsed);
}

export async function saveStatus(
  token: string,
  animeId: string,
  status: AnimeStatusRecord['status'],
  anime: AnimeItem,
  onUnauthorized?: () => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await apiFetch(
    '/api/statuses',
    {
      method: 'PUT',
      body: JSON.stringify({ animeId, status, anime }),
      signal,
    },
    token,
    onUnauthorized
  );

  if (!response.ok) {
    const parsed = await parseJsonResponse(response);
    throw new Error(getErrorMessage(parsed, 'ステータス保存に失敗しました。'));
  }
}

export async function deleteStatus(
  token: string,
  animeId: string,
  onUnauthorized?: () => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await apiFetch(
    `/api/statuses?animeId=${encodeURIComponent(animeId)}`,
    { method: 'DELETE', signal },
    token,
    onUnauthorized
  );

  if (!response.ok) {
    const parsed = await parseJsonResponse(response);
    throw new Error(getErrorMessage(parsed, 'ステータス削除に失敗しました。'));
  }
}

export type SeasonalApiResponse = {
  year: number;
  season: AnimeSeason;
  items: AnimeItem[];
  source: AnimeSourceName;
  cached: boolean;
  warning?: string;
  enrichWarning?: string;
  error?: string;
};

export async function fetchSeasonalAnime(
  year: number,
  season: AnimeSeason,
  token?: string | null,
  onUnauthorized?: () => void,
  signal?: AbortSignal
): Promise<SeasonalApiResponse> {
  const response = await apiFetch(
    `/api/anime/seasonal?year=${year}&season=${season}`,
    { method: 'GET', cache: 'no-store', signal },
    token,
    onUnauthorized
  );
  const parsed = await parseJsonResponse(response);

  if (!response.ok) {
    const fallback =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as SeasonalApiResponse).error ?? '季節アニメの取得に失敗しました。')
        : '季節アニメの取得に失敗しました。';
    throw new Error(getErrorMessage(parsed, fallback));
  }

  return parseSeasonalResponse(parsed);
}

export async function fetchRemoteBoard(
  year: number,
  season: AnimeSeason,
  token: string,
  onUnauthorized?: () => void,
  signal?: AbortSignal
): Promise<BoardState | null> {
  const response = await apiFetch(
    `/api/boards?year=${year}&season=${season}`,
    { method: 'GET', cache: 'no-store', signal },
    token,
    onUnauthorized
  );

  if (response.status === 404) {
    return null;
  }

  const parsed = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(parsed, `ボード取得に失敗しました (${response.status})`));
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ボード取得の応答形式が不正です。');
  }

  const board = (parsed as { board?: unknown }).board;
  return board && isBoardState(board) ? board : null;
}

export async function saveRemoteBoard(
  board: BoardState,
  token: string,
  options: SaveRemoteBoardOptions = {}
): Promise<SaveRemoteBoardResult> {
  const response = await apiFetch(
    '/api/boards',
    {
      method: 'PUT',
      body: JSON.stringify({
        board,
        expectedUpdatedAt: options.expectedUpdatedAt ?? null,
      }),
      signal: options.signal,
    },
    token,
    options.onUnauthorized
  );

  if (response.status === 409) {
    return { ok: false, conflict: true };
  }

  if (!response.ok) {
    const parsed = await parseJsonResponse(response);
    throw new Error(getErrorMessage(parsed, 'ボード保存に失敗しました。'));
  }

  return { ok: true };
}