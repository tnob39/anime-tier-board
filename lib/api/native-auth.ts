import { decode, encode } from "@auth/core/jwt";

import { createNativeSession, isNativeSessionValid, revokeNativeSession } from "@/lib/native-sessions";

const NATIVE_SESSION_SALT = "native-auth-session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type NativeSessionUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type GoogleTokenInfo = {
  sub?: string;
  email?: string;
  name?: string;
  email_verified?: string;
  aud?: string;
  iss?: string;
  exp?: string;
};

function getNativeAuthSecret(): string {
  const secret = process.env.NATIVE_AUTH_SECRET;
  if (!secret) {
    throw new Error("NATIVE_AUTH_SECRET is not configured");
  }
  return secret;
}

function getAllowedGoogleClientIds(): string[] {
  return [
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_NATIVE_ID,
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ].filter((value): value is string => Boolean(value));
}

export async function createNativeSessionToken(user: NativeSessionUser): Promise<string> {
  const { sessionId } = await createNativeSession(user.id);

  return encode({
    token: {
      sub: user.id,
      sid: sessionId,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
    },
    secret: getNativeAuthSecret(),
    salt: NATIVE_SESSION_SALT,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function getUserFromSessionToken(token: string): Promise<NativeSessionUser | null> {
  const decoded = await decode({
    token,
    secret: getNativeAuthSecret(),
    salt: NATIVE_SESSION_SALT,
  });

  if (!decoded?.sub || typeof decoded.sid !== "string") {
    return null;
  }

  const valid = await isNativeSessionValid(decoded.sid);
  if (!valid) {
    return null;
  }

  return {
    id: decoded.sub,
    email: typeof decoded.email === "string" ? decoded.email : null,
    name: typeof decoded.name === "string" ? decoded.name : null,
  };
}

export async function getSessionIdFromAuthorizationHeader(
  authorizationHeader: string | null
): Promise<string | null> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  const decoded = await decode({
    token,
    secret: getNativeAuthSecret(),
    salt: NATIVE_SESSION_SALT,
  });

  return typeof decoded?.sid === "string" ? decoded.sid : null;
}

export async function revokeSessionFromAuthorizationHeader(
  authorizationHeader: string | null
): Promise<void> {
  const sessionId = await getSessionIdFromAuthorizationHeader(authorizationHeader);
  if (sessionId) {
    await revokeNativeSession(sessionId);
  }
}

export async function getUserIdFromAuthorizationHeader(
  authorizationHeader: string | null
): Promise<string | null> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  const user = await getUserFromSessionToken(token);
  return user?.id ?? null;
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token || null;
}

export async function verifyGoogleIdToken(idToken: string): Promise<NativeSessionUser> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!response.ok) {
    throw new Error("Google ID token verification failed");
  }

  const payload = (await response.json()) as GoogleTokenInfo;
  const allowedClientIds = getAllowedGoogleClientIds();

  if (allowedClientIds.length === 0) {
    throw new Error("No allowed Google client IDs configured");
  }

  if (!payload.aud || !allowedClientIds.includes(payload.aud)) {
    throw new Error("Google ID token audience is not allowed");
  }

  if (!payload.iss || !GOOGLE_ISSUERS.includes(payload.iss)) {
    throw new Error("Google ID token issuer is not allowed");
  }

  if (payload.email_verified !== "true") {
    throw new Error("Google account email is not verified");
  }

  const expSeconds = payload.exp ? Number(payload.exp) : NaN;
  if (!Number.isFinite(expSeconds) || expSeconds * 1000 <= Date.now()) {
    throw new Error("Google ID token has expired");
  }

  if (!payload.sub) {
    throw new Error("Google ID token is missing subject");
  }

  return {
    id: payload.sub,
    email: payload.email ?? null,
    name: payload.name ?? null,
  };
}
