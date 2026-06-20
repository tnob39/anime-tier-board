import { API_BASE } from '@/lib/api-base';
import { clearStoredSessionToken, getStoredSessionToken, setStoredSessionToken } from '@/lib/auth-storage';

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type ExchangeResponse = {
  token: string;
  user: AuthUser;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuthUser(value: unknown): value is AuthUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.email === null || typeof value.email === 'string') &&
    (value.name === null || typeof value.name === 'string')
  );
}

function parseExchangeResponse(payload: unknown, message: string): ExchangeResponse {
  if (!isRecord(payload) || typeof payload.token !== 'string' || !isAuthUser(payload.user)) {
    throw new Error(message);
  }

  return {
    token: payload.token,
    user: payload.user,
  };
}

function getResponseErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  if (typeof payload.error === 'string') {
    return payload.error;
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  return fallback;
}

export async function exchangeGoogleIdToken(idToken: string): Promise<ExchangeResponse> {
  const response = await fetch(`${API_BASE}/api/auth/native`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idToken }),
  });

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(payload, `Exchange failed (${response.status})`));
  }

  const exchange = parseExchangeResponse(payload, 'Invalid native auth exchange response');
  await setStoredSessionToken(exchange.token);
  return exchange;
}

export async function exchangeDevSession(): Promise<ExchangeResponse> {
  const response = await fetch(`${API_BASE}/api/auth/native`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      devMode: true,
      email: 'native-dev@local.test',
      name: 'Native Dev User',
    }),
  });

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(payload, `Dev exchange failed (${response.status})`));
  }

  const exchange = parseExchangeResponse(payload, 'Invalid native dev auth exchange response');
  await setStoredSessionToken(exchange.token);
  return exchange;
}

export async function fetchCurrentUser(token?: string | null): Promise<AuthUser | null> {
  const sessionToken = token ?? (await getStoredSessionToken());
  if (!sessionToken) {
    return null;
  }

  const response = await fetch(`${API_BASE}/api/auth/native`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (response.status === 401) {
    await clearStoredSessionToken();
    return null;
  }

  if (!response.ok) {
    throw new Error(`Session validation failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isAuthUser(payload.user)) {
    throw new Error('Invalid current user response');
  }

  return payload.user;
}

export async function fetchStatusesWithAuth(token?: string | null): Promise<unknown> {
  const sessionToken = token ?? (await getStoredSessionToken());
  if (!sessionToken) {
    throw new Error('ログインが必要です。');
  }

  const response = await fetch(`${API_BASE}/api/statuses`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const message =
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof (parsed as { error?: string }).error === 'string'
        ? (parsed as { error: string }).error
        : `Fetch failed (${response.status})`;
    throw new Error(message);
  }

  return parsed;
}

export async function signOutNative(token?: string | null): Promise<void> {
  const sessionToken = token ?? (await getStoredSessionToken());

  if (sessionToken) {
    try {
      await fetch(`${API_BASE}/api/auth/native`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
    } catch (error) {
      console.error('Failed to revoke native session on server', error);
    }
  }

  await clearStoredSessionToken();
}
