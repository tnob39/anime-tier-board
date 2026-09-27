import { isIP } from "node:net";

import {
  assertSameOriginBrowserWrite,
  jsonWriteError,
  WRITE_REQUEST_MALFORMED,
} from "./write-request-guard.ts";
import {
  createInMemoryWriteRateLimitStore,
  createTursoWriteRateLimitStore,
  type InMemoryWriteRateLimitStore,
  type WriteRateLimitStore,
  validateWriteRateLimitSecret,
} from "./write-rate-limit-store.ts";

/** 公開 write の日本語 429。Retry-After とセットで返す。 */
export const WRITE_RATE_LIMITED =
  "リクエストが多すぎます。しばらくしてから再度お試しください。";

/** 本番で trusted proxy 未設定の匿名/IP 必須経路。 */
export const WRITE_PROXY_UNCONFIGURED =
  "この環境ではリクエストを受け付けられません。";

/** trusted proxy ヘッダが欠落・複数・不正でクライアントを識別できない。 */
export const WRITE_CLIENT_UNIDENTIFIED = "リクエストを識別できません。";

/** プロセス内バケットが満杯。active を FIFO 退去させない。 */
export const WRITE_RATE_LIMIT_SATURATED =
  "現在リクエストを受け付けられません。";

export const WRITE_TRUSTED_PROXY_ENV = "WRITE_TRUSTED_PROXY";
export const WRITE_IDENTITY_MAX_LENGTH = 128;
export const WRITE_RATE_LIMIT_MAX_BUCKETS = 8000;

export const WRITE_BODY_MAX_BYTES = {
  jsonDefault: 4096,
  comment: 4096,
  commentReport: 4096,
  reaction: 4096,
  share: 800_000,
  seasonShare: 8192,
  evangelist: 8192,
  board: 300_000,
  status: 80_000,
  watchlist: 20_000,
  statusPatch: 8_000,
  account: 4096,
  subscription: 8192,
  push: 8192,
  nativeAuth: 8192,
} as const;

export type WriteRatePolicyName =
  | "comment"
  | "commentDelete"
  | "commentReport"
  | "commentModeration"
  | "reaction"
  | "shareCreate"
  | "feedback"
  | "userWrite"
  | "nativeAuth";

export type WriteRatePolicy = {
  name: WriteRatePolicyName;
  limit: number;
  windowMs: number;
};

export const WRITE_RATE_POLICIES: Record<WriteRatePolicyName, WriteRatePolicy> =
  {
    comment: { name: "comment", limit: 10, windowMs: 10 * 60 * 1000 },
    commentDelete: { name: "commentDelete", limit: 20, windowMs: 10 * 60 * 1000 },
    commentReport: { name: "commentReport", limit: 20, windowMs: 10 * 60 * 1000 },
    commentModeration: { name: "commentModeration", limit: 30, windowMs: 10 * 60 * 1000 },
    reaction: { name: "reaction", limit: 60, windowMs: 10 * 60 * 1000 },
    shareCreate: { name: "shareCreate", limit: 10, windowMs: 10 * 60 * 1000 },
    feedback: { name: "feedback", limit: 5, windowMs: 10 * 60 * 1000 },
    userWrite: { name: "userWrite", limit: 120, windowMs: 10 * 60 * 1000 },
    nativeAuth: { name: "nativeAuth", limit: 20, windowMs: 10 * 60 * 1000 },
  };

export type WriteAuthSource = "bearer" | "session";
export type WriteAuthIdentity = {
  userId: string;
  source: WriteAuthSource;
};

/**
 * Bearer が有効なら session より優先（requireUserId と同じ順序）。
 * どちらも無ければ null。auth を弱めない。
 */
export function classifyWriteAuth(input: {
  bearerUserId?: string | null;
  sessionUserId?: string | null;
}): WriteAuthIdentity | null {
  const bearer = input.bearerUserId?.trim() ?? "";
  if (bearer) return { userId: bearer, source: "bearer" };
  const session = input.sessionUserId?.trim() ?? "";
  if (session) return { userId: session, source: "session" };
  return null;
}

/** クライアント側の期限切れ・不正 compact のみ。署名/復号/鍵不一致は含めない。 */
const NARROW_BEARER_TOKEN_ERROR_NAMES = new Set([
  "JWTExpired",
  "JWTInvalid",
  "JWEInvalid",
]);

/**
 * 狭く証明できる malformed/expired だけ invalid Bearer。
 * JOSEError 親クラス、復号失敗、鍵不一致、設定エラーは false（fail-closed）。
 */
export function isBearerTokenValidationFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const lower = error.message.toLowerCase();
  if (
    lower.includes("no matching decryption secret") ||
    lower.includes("decryption") ||
    lower.includes("not configured") ||
    lower.includes("unsupported jwt") ||
    lower.includes("turso") ||
    lower.includes("libsql") ||
    lower.includes("sqlite") ||
    lower.includes("database")
  ) {
    return false;
  }
  const name = error.name;
  if (
    name === "JOSEError" ||
    name === "JWEDecryptionFailed" ||
    name === "JWSSignatureVerificationFailed" ||
    name === "JWKInvalid" ||
    name === "JWKSNoMatchingKey"
  ) {
    return false;
  }
  return NARROW_BEARER_TOKEN_ERROR_NAMES.has(name);
}

export async function readBearerUserIdForWrite(
  read: () => Promise<string | null>
): Promise<string | null> {
  try {
    const userId = await read();
    return userId?.trim() ? userId.trim() : null;
  } catch (error) {
    if (isBearerTokenValidationFailure(error)) return null;
    throw error;
  }
}

/**
 * 有効 Bearer なら session を呼ばない。
 * invalid/malformed/expired Bearer は null として auth をちょうど 1 回。
 * Bearer 側の非検証エラーは伝播し、session は呼ばない。
 */
export async function resolveWriteIdentityFromLookups(lookups: {
  getBearerUserId: () => Promise<string | null>;
  getSessionUserId: () => Promise<string | null>;
}): Promise<WriteAuthIdentity | null> {
  const bearerUserId = await lookups.getBearerUserId();
  const fromBearer = classifyWriteAuth({ bearerUserId });
  if (fromBearer?.source === "bearer") {
    return fromBearer;
  }
  const sessionUserId = await lookups.getSessionUserId();
  return classifyWriteAuth({ sessionUserId });
}

/**
 * cookie/session write のみ same-origin を要求する。
 * 有効 Bearer は Origin を要求しない。
 */
export function assertSessionWriteSameOrigin(
  request: Request,
  identity: WriteAuthIdentity
): Response | null {
  if (identity.source === "bearer") return null;
  return assertSameOriginBrowserWrite(request);
}

let nowOverrideMs: number | null = null;
let injectedStore: WriteRateLimitStore | null = null;
let testStore: InMemoryWriteRateLimitStore | null = null;
let productionStoreCache: {
  secret: string;
  store: WriteRateLimitStore;
} | null = null;
let productionStoreCreationCount = 0;

function nowMs(): number {
  return nowOverrideMs ?? Date.now();
}

function getProductionWriteRateLimitStore(secretValue: unknown): WriteRateLimitStore {
  const secret = validateWriteRateLimitSecret(secretValue);
  if (productionStoreCache?.secret === secret) return productionStoreCache.store;

  const store = createTursoWriteRateLimitStore({
    maxBuckets: WRITE_RATE_LIMIT_MAX_BUCKETS,
    secret,
  });
  productionStoreCache = { secret, store };
  productionStoreCreationCount += 1;
  return store;
}

export type TrustedProxyMode = "vercel" | "test";

export type AdmissionEnv = {
  WRITE_TRUSTED_PROXY?: string;
  NODE_ENV?: string;
};

function isProductionRuntime(env: AdmissionEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

/**
 * test は NODE_ENV=production では拒否（x-test-client-ip を本番で使わない）。
 */
export function getConfiguredTrustedProxyMode(
  env: AdmissionEnv = process.env
): TrustedProxyMode | null {
  const raw = env.WRITE_TRUSTED_PROXY?.trim().toLowerCase();
  if (raw === "test") {
    if (isProductionRuntime(env)) return null;
    return "test";
  }
  if (raw === "vercel") return "vercel";
  return null;
}

function collectHeaderValues(headers: Headers, name: string): string[] {
  const values: string[] = [];
  const target = name.toLowerCase();
  headers.forEach((value, key) => {
    if (key.toLowerCase() === target) values.push(value);
  });
  return values;
}

function isSingleIpLiteral(value: string): boolean {
  const ip = value.trim();
  if (ip === "" || ip.includes(",") || /\s/.test(ip)) return false;
  return isIP(ip) !== 0;
}

export type ClientIpResult =
  | { ok: true; ip: string }
  | { ok: false; reason: "unconfigured" | "invalid" };

/**
 * Trusted proxy 前提のクライアント IP。
 * - vercel: プラットフォーム所有の x-vercel-forwarded-for / x-real-ip のみ。
 *   カンマ区切りや複数ヘッダは推測せず拒否。x-forwarded-for は使わない。
 * - test: 非本番かつ WRITE_TRUSTED_PROXY=test のときだけ x-test-client-ip。
 * 未知の proxy 値は未設定と同じ（推測しない）。
 */
export function resolveTrustedClientIp(
  request: Request,
  env: AdmissionEnv = process.env
): ClientIpResult {
  const mode = getConfiguredTrustedProxyMode(env);
  if (mode === "test") {
    return singleHeaderIp(request.headers, "x-test-client-ip");
  }
  if (mode === "vercel") {
    const vercel = singleHeaderIp(request.headers, "x-vercel-forwarded-for");
    if (vercel.ok) return vercel;
    if (vercel.reason === "invalid") return vercel;
    return singleHeaderIp(request.headers, "x-real-ip");
  }
  return { ok: false, reason: "unconfigured" };
}

function singleHeaderIp(headers: Headers, name: string): ClientIpResult {
  const values = collectHeaderValues(headers, name);
  if (values.length === 0) return { ok: false, reason: "unconfigured" };
  if (values.length !== 1) return { ok: false, reason: "invalid" };
  const raw = values[0];
  if (raw.includes(",")) return { ok: false, reason: "invalid" };
  const ip = raw.trim();
  if (!isSingleIpLiteral(ip) || ip.length > WRITE_IDENTITY_MAX_LENGTH) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, ip };
}

export type WriteRateLimitSubject = {
  policy: WriteRatePolicyName;
  userId?: string;
  requireIp?: boolean;
  env?: AdmissionEnv;
};

function identityTooLong(value: string): boolean {
  return value.length > WRITE_IDENTITY_MAX_LENGTH;
}

function resolveIdentity(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim();
}

export function writeRateLimitedResponse(retryAfterSec: number): Response {
  return jsonWriteError(WRITE_RATE_LIMITED, 429, {
    "Retry-After": String(Math.max(1, retryAfterSec)),
  });
}

/**
 * user キーと IP キーを独立に検査し、全て通ればまとめて消費する。
 * 片方の上限超過で他方を消費しない。満杯時は active を追い出さず 503。
 */
export async function consumeWriteRateLimit(
  request: Request,
  subject: WriteRateLimitSubject
): Promise<Response | null> {
  const policy = WRITE_RATE_POLICIES[subject.policy];
  const env = subject.env ?? process.env;
  const userId = resolveIdentity(subject.userId);
  if (userId === undefined) {
    return jsonWriteError(WRITE_CLIENT_UNIDENTIFIED, 403);
  }
  if (userId && identityTooLong(userId)) {
    return jsonWriteError(WRITE_CLIENT_UNIDENTIFIED, 403);
  }

  const ipResult = resolveTrustedClientIp(request, env);

  if (ipResult.ok === false && ipResult.reason === "invalid") {
    return jsonWriteError(WRITE_CLIENT_UNIDENTIFIED, 403);
  }

  let ipKey: string | null = null;
  if (ipResult.ok) {
    ipKey = ipResult.ip;
  } else if (subject.requireIp) {
    if (isProductionRuntime(env)) {
      return jsonWriteError(WRITE_PROXY_UNCONFIGURED, 503);
    }
    ipKey = "dev-local";
  }

  const keys: Array<{ kind: "user" | "ip"; value: string }> = [];
  if (userId) keys.push({ kind: "user", value: userId });
  if (ipKey) keys.push({ kind: "ip", value: ipKey });

  if (keys.length === 0) {
    return jsonWriteError(WRITE_CLIENT_UNIDENTIFIED, 403);
  }

  const now = nowMs();

  try {
    const store = isProductionRuntime(env)
      ? getProductionWriteRateLimitStore(process.env.WRITE_RATE_LIMIT_SECRET ?? "")
      : (injectedStore ?? (testStore ??= createInMemoryWriteRateLimitStore({
          maxBuckets: WRITE_RATE_LIMIT_MAX_BUCKETS,
          secret: "atb-local-write-rate-limit-test-key-32chars",
        })));
    const result = await store.consume({
      policy: policy.name,
      limit: policy.limit,
      windowMs: policy.windowMs,
      nowMs: now,
      keys,
    });
    if (result.kind === "limited") {
      return writeRateLimitedResponse(result.retryAfterSec);
    }
  } catch {
    return jsonWriteError(WRITE_RATE_LIMIT_SATURATED, 503);
  }

  return null;
}

export async function admitCookieCapableWrite(
  request: Request,
  identity: WriteAuthIdentity,
  policy: WriteRatePolicyName,
  env?: AdmissionEnv
): Promise<Response | null> {
  const csrf = assertSessionWriteSameOrigin(request, identity);
  if (csrf) return csrf;
  return consumeWriteRateLimit(request, {
    userId: identity.userId,
    policy,
    env,
  });
}

export function resetWriteAdmissionForTests(): void {
  injectedStore = null;
  productionStoreCache = null;
  productionStoreCreationCount = 0;
  testStore ??= createInMemoryWriteRateLimitStore({
    maxBuckets: WRITE_RATE_LIMIT_MAX_BUCKETS,
    secret: "atb-local-write-rate-limit-test-key-32chars",
  });
  testStore.reset();
  testStore.setMaxBuckets(WRITE_RATE_LIMIT_MAX_BUCKETS);
  nowOverrideMs = null;
}

export function getWriteRateLimitStoreCreationCountForTests(): number {
  return productionStoreCreationCount;
}

export function setWriteRateLimitStoreForTests(
  store: WriteRateLimitStore | null
): void {
  injectedStore = store;
}

export function setWriteAdmissionNowForTests(now: number | null): void {
  nowOverrideMs = now;
}

export function setWriteAdmissionMaxBucketsForTests(max: number | null): void {
  testStore ??= createInMemoryWriteRateLimitStore({
    maxBuckets: WRITE_RATE_LIMIT_MAX_BUCKETS,
    secret: "atb-local-write-rate-limit-test-key-32chars",
  });
  testStore.setMaxBuckets(max);
}

export function getWriteAdmissionBucketSizeForTests(): number {
  return testStore?.size() ?? 0;
}

export function getWriteAdmissionBucketCountForTests(key: string): number {
  return testStore?.countForKey(key, nowMs()) ?? 0;
}

export function seedWriteAdmissionBucketForTests(
  key: string,
  count: number,
  resetAt: number
): void {
  testStore ??= createInMemoryWriteRateLimitStore({
    maxBuckets: WRITE_RATE_LIMIT_MAX_BUCKETS,
    secret: "atb-local-write-rate-limit-test-key-32chars",
  });
  testStore.seed(key, count, resetAt);
}

/**
 * Idempotency-Key の境界。
 * 欠落は無視（既存クライアント互換）。
 * 存在するが不正なら 400。永続 replay は持たない（残ギャップ）。
 */
export function assertOptionalIdempotencyKey(
  request: Request
): Response | null {
  const values = collectHeaderValues(request.headers, "idempotency-key");
  if (values.length === 0) return null;
  if (values.length !== 1) {
    return jsonWriteError(WRITE_REQUEST_MALFORMED, 400);
  }
  const key = values[0].trim();
  if (key === "" || key.length > 128 || !/^[\w.:-]{1,128}$/.test(key)) {
    return jsonWriteError(WRITE_REQUEST_MALFORMED, 400);
  }
  return null;
}
