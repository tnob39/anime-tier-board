import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  exchangeDevSession,
  exchangeGoogleIdToken,
  fetchCurrentUser,
  signOutNative,
  type AuthUser,
} from '@/lib/auth-api';
import { clearStoredSessionToken, getStoredSessionToken } from '@/lib/auth-storage';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signingIn: boolean;
  authError: string | null;
  sessionExpired: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithDev: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearAuthError: () => void;
  handleUnauthorized: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
  });

  const clearAuthState = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const storedToken = await getStoredSessionToken();
    setToken(storedToken);

    if (!storedToken) {
      clearAuthState();
      return;
    }

    try {
      const currentUser = await fetchCurrentUser(storedToken);
      if (!currentUser) {
        await clearStoredSessionToken();
        clearAuthState();
        setSessionExpired(true);
        return;
      }

      setUser(currentUser);
      setSessionExpired(false);
      setAuthError(null);
    } catch (error) {
      console.error('Session refresh failed', error);
      setAuthError(error instanceof Error ? error.message : 'セッション確認に失敗しました。');
    }
  }, [clearAuthState]);

  useEffect(() => {
    void (async () => {
      try {
        await refreshSession();
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshSession]);

  useEffect(() => {
    if (googleResponse?.type !== 'success') {
      return;
    }

    const idToken = googleResponse.authentication?.idToken;
    if (!idToken) {
      return;
    }

    void (async () => {
      setSigningIn(true);
      setAuthError(null);
      try {
        const result = await exchangeGoogleIdToken(idToken);
        setToken(result.token);
        setUser(result.user);
        setSessionExpired(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Google ログインに失敗しました。';
        setAuthError(message);
      } finally {
        setSigningIn(false);
      }
    })();
  }, [googleResponse]);

  const signInWithGoogle = useCallback(async () => {
    if (!googleWebClientId && !googleIosClientId && !googleAndroidClientId) {
      throw new Error('Google Client ID が未設定です。EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID を設定してください。');
    }

    setSigningIn(true);
    setAuthError(null);
    setSessionExpired(false);

    try {
      const result = await promptGoogleAsync();
      if (result?.type === 'cancel') {
        return;
      }

      if (result?.type === 'success' && result.authentication?.idToken) {
        const exchange = await exchangeGoogleIdToken(result.authentication.idToken);
        setToken(exchange.token);
        setUser(exchange.user);
        return;
      }

      if (result?.type === 'error') {
        throw new Error(result.error?.message ?? 'Google 認証に失敗しました。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google ログインに失敗しました。';
      setAuthError(message);
      throw error;
    } finally {
      setSigningIn(false);
    }
  }, [promptGoogleAsync]);

  const signInWithDev = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    setSessionExpired(false);

    try {
      const result = await exchangeDevSession();
      setToken(result.token);
      setUser(result.user);
    } catch (error) {
      const message = error instanceof Error ? error.message : '開発モードログインに失敗しました。';
      setAuthError(message);
      throw error;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutNative();
    clearAuthState();
    setSessionExpired(false);
    setAuthError(null);
  }, [clearAuthState]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setSessionExpired(false);
  }, []);

  const handleUnauthorized = useCallback(() => {
    void (async () => {
      await clearStoredSessionToken();
      clearAuthState();
      setSessionExpired(true);
      setAuthError('セッションが期限切れです。再ログインしてください。');
    })();
  }, [clearAuthState]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      signingIn,
      authError,
      sessionExpired,
      signInWithGoogle,
      signInWithDev,
      signOut,
      refreshSession,
      clearAuthError,
      handleUnauthorized,
    }),
    [
      user,
      token,
      loading,
      signingIn,
      authError,
      sessionExpired,
      signInWithGoogle,
      signInWithDev,
      signOut,
      refreshSession,
      clearAuthError,
      handleUnauthorized,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}