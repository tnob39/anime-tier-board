import { API_BASE } from '@/lib/api-base';
import { isBoardState, type BoardState } from '@/lib/board';
import type { AnimeStatusRecord, ViewingStatus } from '@/lib/statuses';
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

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  onUnauthorized?: () => void
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    onUnauthorized?.();
    throw new SessionExpiredError();
  }

  return response;
}

export async function fetchStatuses(
  token: string,
  onUnauthorized?: () => void
): Promise<AnimeStatusRecord[]> {
  const response = await apiFetch('/api/statuses', { method: 'GET' }, token, onUnauthorized);
  const parsed = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(parsed, `ステータス取得に失敗しました (${response.status})`));
  }

  const payload = parsed as { statuses?: AnimeStatusRecord[] };
  return payload.statuses ?? [];
}

export async function saveStatus(
  token: string,
  animeId: string,
  status: ViewingStatus,
  anime: AnimeItem,
  onUnauthorized?: () => void
): Promise<void> {
  const response = await apiFetch(
    '/api/statuses',
    {
      method: 'PUT',
      body: JSON.stringify({ animeId, status, anime }),
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
  onUnauthorized?: () => void
): Promise<void> {
  const response = await apiFetch(
    `/api/statuses?animeId=${encodeURIComponent(animeId)}`,
    { method: 'DELETE' },
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
  onUnauthorized?: () => void
): Promise<SeasonalApiResponse> {
  const response = await apiFetch(
    `/api/anime/seasonal?year=${year}&season=${season}`,
    { method: 'GET', cache: 'no-store' },
    token,
    onUnauthorized
  );
  const parsed = await parseJsonResponse(response);
  const payload = parsed as SeasonalApiResponse;

  if (!response.ok) {
    throw new Error(getErrorMessage(parsed, payload.error ?? '季節アニメの取得に失敗しました。'));
  }

  return payload;
}

export async function fetchRemoteBoard(
  year: number,
  season: AnimeSeason,
  token: string,
  onUnauthorized?: () => void
): Promise<BoardState | null> {
  const response = await apiFetch(
    `/api/boards?year=${year}&season=${season}`,
    { method: 'GET', cache: 'no-store' },
    token,
    onUnauthorized
  );

  if (!response.ok) {
    return null;
  }

  const parsed = await parseJsonResponse(response);
  const payload = parsed as { board?: unknown };
  return payload.board && isBoardState(payload.board) ? payload.board : null;
}

export async function saveRemoteBoard(
  board: BoardState,
  token: string,
  onUnauthorized?: () => void
): Promise<void> {
  const response = await apiFetch(
    '/api/boards',
    {
      method: 'PUT',
      body: JSON.stringify({ board }),
    },
    token,
    onUnauthorized
  );

  if (!response.ok) {
    const parsed = await parseJsonResponse(response);
    throw new Error(getErrorMessage(parsed, 'ボード保存に失敗しました。'));
  }
}