import { decode, encode } from "@auth/core/jwt";

export const SESSION_COOKIE_NAME = "authjs.session-token";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type NativeSessionUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type GoogleTokenInfo = {
  sub?: string;
  email?: string;
  name?: string;
  aud?: string;
  email_verified?: string;
};

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
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
  return encode({
    token: {
      sub: user.id,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
    },
    secret: getAuthSecret(),
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function getUserFromSessionToken(token: string): Promise<NativeSessionUser | null> {
  const decoded = await decode({
    token,
    secret: getAuthSecret(),
    salt: SESSION_COOKIE_NAME,
  });

  if (!decoded?.sub) {
    return null;
  }

  return {
    id: decoded.sub,
    email: typeof decoded.email === "string" ? decoded.email : null,
    name: typeof decoded.name === "string" ? decoded.name : null,
  };
}

export async function getUserIdFromAuthorizationHeader(
  authorizationHeader: string | null
): Promise<string | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }

  const user = await getUserFromSessionToken(token);
  return user?.id ?? null;
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

  if (!payload.sub) {
    throw new Error("Google ID token is missing subject");
  }

  if (allowedClientIds.length > 0 && (!payload.aud || !allowedClientIds.includes(payload.aud))) {
    throw new Error("Google ID token audience is not allowed");
  }

  return {
    id: payload.sub,
    email: payload.email ?? null,
    name: payload.name ?? null,
  };
}