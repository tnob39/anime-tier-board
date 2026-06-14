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
import { getStoredSessionToken } from '@/lib/auth-storage';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signingIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithDev: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
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

  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
  });

  const refreshSession = useCallback(async () => {
    const storedToken = await getStoredSessionToken();
    setToken(storedToken);

    if (!storedToken) {
      setUser(null);
      return;
    }

    const currentUser = await fetchCurrentUser(storedToken);
    setUser(currentUser);
    if (!currentUser) {
      setToken(null);
    }
  }, []);

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
      try {
        const result = await exchangeGoogleIdToken(idToken);
        setToken(result.token);
        setUser(result.user);
      } catch (error) {
        console.error('Google exchange failed', error);
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
    try {
      const result = await promptGoogleAsync();
      if (result?.type === 'success' && result.authentication?.idToken) {
        const exchange = await exchangeGoogleIdToken(result.authentication.idToken);
        setToken(exchange.token);
        setUser(exchange.user);
      }
    } finally {
      setSigningIn(false);
    }
  }, [promptGoogleAsync]);

  const signInWithDev = useCallback(async () => {
    setSigningIn(true);
    try {
      const result = await exchangeDevSession();
      setToken(result.token);
      setUser(result.user);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutNative();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      signingIn,
      signInWithGoogle,
      signInWithDev,
      signOut,
      refreshSession,
    }),
    [user, token, loading, signingIn, signInWithGoogle, signInWithDev, signOut, refreshSession]
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