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
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      (typeof payload?.error === 'string' ? payload.error : payload?.message) ??
        `Exchange failed (${response.status})`
    );
  }

  await setStoredSessionToken(payload.token);
  return payload as ExchangeResponse;
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
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      (typeof payload?.error === 'string' ? payload.error : payload?.message) ??
        `Dev exchange failed (${response.status})`
    );
  }

  await setStoredSessionToken(payload.token);
  return payload as ExchangeResponse;
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

  const payload = (await response.json()) as { user: AuthUser };
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

export async function signOutNative(): Promise<void> {
  await clearStoredSessionToken();
}