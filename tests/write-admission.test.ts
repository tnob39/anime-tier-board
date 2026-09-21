import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { encode } from "@auth/core/jwt";
import {
  NATIVE_SESSION_SALT,
  getUserIdFromAuthorizationHeader,
} from "../lib/api/native-auth.ts";
import {
  WRITE_CLIENT_UNIDENTIFIED,
  WRITE_IDENTITY_MAX_LENGTH,
  WRITE_PROXY_UNCONFIGURED,
  WRITE_RATE_LIMITED,
  WRITE_RATE_LIMIT_SATURATED,
  WRITE_RATE_POLICIES,
  admitCookieCapableWrite,
  assertOptionalIdempotencyKey,
  assertSessionWriteSameOrigin,
  classifyWriteAuth,
  consumeWriteRateLimit,
  isBearerTokenValidationFailure,
  readBearerUserIdForWrite,
  resolveWriteIdentityFromLookups,
  getConfiguredTrustedProxyMode,
  getWriteAdmissionBucketCountForTests,
  getWriteAdmissionBucketSizeForTests,
  resetWriteAdmissionForTests,
  resolveTrustedClientIp,
  seedWriteAdmissionBucketForTests,
  setWriteAdmissionMaxBucketsForTests,
  setWriteAdmissionNowForTests,
} from "../lib/api/write-admission.ts";
import {
  WRITE_ORIGIN_FORBIDDEN,
  WRITE_REQUEST_MALFORMED,
} from "../lib/api/write-request-guard.ts";

afterEach(() => {
  resetWriteAdmissionForTests();
});

function requestWith(init: {
  ip?: string;
  vercelIp?: string;
  realIp?: string;
  forwardedFor?: string;
  extraVercel?: string;
  idempotencyKey?: string;
  idempotencyKeys?: string[];
}): Request {
  const headers = new Headers();
  if (init.ip) headers.set("x-test-client-ip", init.ip);
  if (init.vercelIp) headers.set("x-vercel-forwarded-for", init.vercelIp);
  if (init.realIp) headers.set("x-real-ip", init.realIp);
  if (init.forwardedFor) headers.set("x-forwarded-for", init.forwardedFor);
  if (init.extraVercel) headers.append("x-vercel-forwarded-for", init.extraVercel);
  if (init.idempotencyKeys) {
    for (const key of init.idempotencyKeys) headers.append("idempotency-key", key);
  } else if (init.idempotencyKey) {
    headers.set("idempotency-key", init.idempotencyKey);
  }
  return new Request("https://anime-tier-board.vercel.app/api/shares/s1/comments", {
    method: "POST",
    headers,
  });
}

async function errorBody(response: Response): Promise<{ error?: string }> {
  return (await response.json()) as { error?: string };
}

test("trusted proxy mode accepts only vercel and test", () => {
  assert.equal(getConfiguredTrustedProxyMode({ WRITE_TRUSTED_PROXY: "vercel" }), "vercel");
  assert.equal(getConfiguredTrustedProxyMode({ WRITE_TRUSTED_PROXY: "TEST" }), "test");
  assert.equal(getConfiguredTrustedProxyMode({ WRITE_TRUSTED_PROXY: "cloudflare" }), null);
  assert.equal(getConfiguredTrustedProxyMode({ WRITE_TRUSTED_PROXY: "" }), null);
  assert.equal(getConfiguredTrustedProxyMode({}), null);
});

test("vercel mode uses platform headers and rejects spoofable XFF", () => {
  const env = { WRITE_TRUSTED_PROXY: "vercel" };
  const ok = resolveTrustedClientIp(
    requestWith({ vercelIp: "203.0.113.10", forwardedFor: "198.51.100.1" }),
    env
  );
  assert.deepEqual(ok, { ok: true, ip: "203.0.113.10" });

  const realIp = resolveTrustedClientIp(requestWith({ realIp: "203.0.113.11" }), env);
  assert.deepEqual(realIp, { ok: true, ip: "203.0.113.11" });

  const xffOnly = resolveTrustedClientIp(
    requestWith({ forwardedFor: "198.51.100.1" }),
    env
  );
  assert.equal(xffOnly.ok, false);

  const comma = resolveTrustedClientIp(
    requestWith({ vercelIp: "203.0.113.10, 198.51.100.1" }),
    env
  );
  assert.deepEqual(comma, { ok: false, reason: "invalid" });

  const multiple = resolveTrustedClientIp(
    requestWith({ vercelIp: "203.0.113.10", extraVercel: "198.51.100.1" }),
    env
  );
  assert.deepEqual(multiple, { ok: false, reason: "invalid" });
});

test("test mode only honors x-test-client-ip", () => {
  const env = { WRITE_TRUSTED_PROXY: "test" };
  const ok = resolveTrustedClientIp(requestWith({ ip: "198.51.100.20" }), env);
  assert.deepEqual(ok, { ok: true, ip: "198.51.100.20" });

  const vercelIgnored = resolveTrustedClientIp(
    requestWith({ vercelIp: "203.0.113.10" }),
    env
  );
  assert.equal(vercelIgnored.ok, false);
});

test("authenticated burst returns 429 Retry-After Japanese contract then retries after window", async () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "test" };
  const policy = WRITE_RATE_POLICIES.comment;
  const started = 1_700_000_000_000;
  setWriteAdmissionNowForTests(started);

  const make = () =>
    consumeWriteRateLimit(requestWith({ ip: "198.51.100.8" }), {
      policy: "comment",
      userId: "user-1",
      env,
    });

  for (let i = 0; i < policy.limit; i += 1) {
    assert.equal(make(), null);
  }

  const denied = make();
  assert.ok(denied);
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get("Retry-After"), String(policy.windowMs / 1000));
  assert.deepEqual(await errorBody(denied), { error: WRITE_RATE_LIMITED });

  setWriteAdmissionNowForTests(started + policy.windowMs);
  assert.equal(make(), null);
});

test("parallel burst isolates users and returns 429 only for the overflowing key", async () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "test" };
  const limit = WRITE_RATE_POLICIES.comment.limit;

  const tasks = Array.from({ length: limit + 5 }, async (_, i) => {
    const sameUser = i < limit + 2;
    const response = consumeWriteRateLimit(
      requestWith({ ip: sameUser ? "198.51.100.30" : `198.51.100.${40 + i}` }),
      {
        policy: "comment",
        userId: sameUser ? "same-user" : `other-${i}`,
        env,
      }
    );
    return response?.status ?? 200;
  });

  const statuses = await Promise.all(tasks);
  assert.equal(statuses.filter((status) => status === 429).length, 2);
  assert.equal(statuses.filter((status) => status === 200).length, limit + 3);
});

test("parallel burst on one IP rate-limits across users", async () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "test" };
  const limit = WRITE_RATE_POLICIES.comment.limit;

  const tasks = Array.from({ length: limit + 3 }, async (_, i) => {
    const response = consumeWriteRateLimit(requestWith({ ip: "198.51.100.77" }), {
      policy: "comment",
      userId: `user-${i}`,
      env,
    });
    return response?.status ?? 200;
  });

  const statuses = await Promise.all(tasks);
  assert.equal(statuses.filter((status) => status === 429).length, 3);
  assert.equal(statuses.filter((status) => status === 200).length, limit);
});

test("anonymous production without proxy config is 503 fail-closed", async () => {
  const denied = consumeWriteRateLimit(requestWith({}), {
    policy: "feedback",
    requireIp: true,
    env: { NODE_ENV: "production" },
  });
  assert.ok(denied);
  assert.equal(denied.status, 503);
  assert.deepEqual(await errorBody(denied), { error: WRITE_PROXY_UNCONFIGURED });
});

test("anonymous development without proxy uses shared dev-local key", () => {
  const env = { NODE_ENV: "development" };
  const policy = WRITE_RATE_POLICIES.feedback;
  for (let i = 0; i < policy.limit; i += 1) {
    assert.equal(
      consumeWriteRateLimit(requestWith({}), {
        policy: "feedback",
        requireIp: true,
        env,
      }),
      null
    );
  }
  const denied = consumeWriteRateLimit(requestWith({}), {
    policy: "feedback",
    requireIp: true,
    env,
  });
  assert.equal(denied?.status, 429);
});

test("invalid proxy identity is 403 not a shared anonymous key", async () => {
  const denied = consumeWriteRateLimit(
    requestWith({ vercelIp: "not-an-ip" }),
    {
      policy: "feedback",
      requireIp: true,
      env: { WRITE_TRUSTED_PROXY: "vercel", NODE_ENV: "production" },
    }
  );
  assert.ok(denied);
  assert.equal(denied.status, 403);
  assert.deepEqual(await errorBody(denied), { error: WRITE_CLIENT_UNIDENTIFIED });
});

test("malformed idempotency key is 400; missing is allowed", async () => {
  assert.equal(assertOptionalIdempotencyKey(requestWith({})), null);
  assert.equal(
    assertOptionalIdempotencyKey(requestWith({ idempotencyKey: "save-1" })),
    null
  );

  const empty = assertOptionalIdempotencyKey(requestWith({ idempotencyKey: "  " }));
  assert.equal(empty?.status, 400);
  assert.deepEqual(await errorBody(empty!), { error: WRITE_REQUEST_MALFORMED });

  const multi = assertOptionalIdempotencyKey(
    requestWith({ idempotencyKeys: ["a", "b"] })
  );
  assert.equal(multi?.status, 400);
});

test("WRITE_TRUSTED_PROXY=test is rejected in production", async () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "production" };
  assert.equal(getConfiguredTrustedProxyMode(env), null);
  const ip = resolveTrustedClientIp(requestWith({ ip: "198.51.100.9" }), env);
  assert.equal(ip.ok, false);

  const denied = consumeWriteRateLimit(requestWith({ ip: "198.51.100.9" }), {
    policy: "feedback",
    requireIp: true,
    env,
  });
  assert.ok(denied);
  assert.equal(denied.status, 503);
  assert.deepEqual(await errorBody(denied), { error: WRITE_PROXY_UNCONFIGURED });
});

test("exhausted IP does not consume the user bucket", () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "test" };
  const now = 1_800_000_000_000;
  setWriteAdmissionNowForTests(now);
  const policy = WRITE_RATE_POLICIES.comment;
  seedWriteAdmissionBucketForTests(
    "comment:ip:198.51.100.50",
    policy.limit,
    now + policy.windowMs
  );

  const denied = consumeWriteRateLimit(requestWith({ ip: "198.51.100.50" }), {
    policy: "comment",
    userId: "rollback-user",
    env,
  });
  assert.equal(denied?.status, 429);
  assert.equal(
    getWriteAdmissionBucketCountForTests("comment:user:rollback-user"),
    0
  );

  const allowed = consumeWriteRateLimit(
    requestWith({ ip: "198.51.100.51" }),
    { policy: "comment", userId: "rollback-user", env }
  );
  assert.equal(allowed, null);
  assert.equal(
    getWriteAdmissionBucketCountForTests("comment:user:rollback-user"),
    1
  );
});

test("rate limiter fails closed at capacity and does not FIFO-evict active keys", () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "test" };
  const now = 1_810_000_000_000;
  setWriteAdmissionNowForTests(now);
  setWriteAdmissionMaxBucketsForTests(2);
  const resetAt = now + WRITE_RATE_POLICIES.comment.windowMs;
  seedWriteAdmissionBucketForTests("comment:user:keep-a", 1, resetAt);
  seedWriteAdmissionBucketForTests("comment:user:keep-b", 1, resetAt);

  const denied = consumeWriteRateLimit(requestWith({ ip: "198.51.100.60" }), {
    policy: "comment",
    userId: "new-user",
    env,
  });
  assert.equal(denied?.status, 503);
  assert.equal(denied && denied.status, 503);

  assert.equal(getWriteAdmissionBucketCountForTests("comment:user:keep-a"), 1);
  assert.equal(getWriteAdmissionBucketCountForTests("comment:user:keep-b"), 1);
  assert.equal(getWriteAdmissionBucketSizeForTests(), 2);
});

test("expired buckets are pruned before capacity check so churn can proceed", () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "test" };
  const now = 1_820_000_000_000;
  setWriteAdmissionNowForTests(now);
  setWriteAdmissionMaxBucketsForTests(2);
  seedWriteAdmissionBucketForTests("comment:user:old-a", 3, now - 1);
  seedWriteAdmissionBucketForTests("comment:user:old-b", 3, now - 1);

  const allowed = consumeWriteRateLimit(
    requestWith({ ip: "198.51.100.70" }),
    { policy: "comment", userId: "fresh-user", env }
  );
  assert.equal(allowed, null);
  assert.equal(getWriteAdmissionBucketCountForTests("comment:user:old-a"), 0);
  assert.ok(getWriteAdmissionBucketCountForTests("comment:user:fresh-user") >= 1);
});

test("oversized identity keys are rejected without creating a bucket", () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "test" };
  const oversized = "u".repeat(WRITE_IDENTITY_MAX_LENGTH + 1);
  const denied = consumeWriteRateLimit(requestWith({ ip: "198.51.100.80" }), {
    policy: "comment",
    userId: oversized,
    env,
  });
  assert.equal(denied?.status, 403);
  assert.equal(getWriteAdmissionBucketSizeForTests(), 0);
});

test("classifyWriteAuth prefers valid bearer over session", () => {
  assert.deepEqual(
    classifyWriteAuth({ bearerUserId: "native-1", sessionUserId: "web-1" }),
    { userId: "native-1", source: "bearer" }
  );
  assert.deepEqual(classifyWriteAuth({ sessionUserId: "web-1" }), {
    userId: "web-1",
    source: "session",
  });
  assert.equal(classifyWriteAuth({}), null);
  assert.equal(classifyWriteAuth({ bearerUserId: "  ", sessionUserId: "  " }), null);
});

test("session writes require same-origin; bearer writes do not", async () => {
  const url = "https://anime-tier-board.vercel.app/api/statuses";
  const session = classifyWriteAuth({ sessionUserId: "web-1" });
  const bearer = classifyWriteAuth({ bearerUserId: "native-1" });
  assert.ok(session && bearer);

  const missingOrigin = new Request(url, { method: "PUT" });
  const sessionDenied = assertSessionWriteSameOrigin(missingOrigin, session);
  assert.ok(sessionDenied);
  assert.equal(sessionDenied.status, 403);
  assert.deepEqual(await errorBody(sessionDenied), { error: WRITE_ORIGIN_FORBIDDEN });

  const bearerAllowed = assertSessionWriteSameOrigin(missingOrigin, bearer);
  assert.equal(bearerAllowed, null);

  const sameOrigin = new Request(url, {
    method: "PUT",
    headers: { origin: "https://anime-tier-board.vercel.app" },
  });
  assert.equal(assertSessionWriteSameOrigin(sameOrigin, session), null);

  const evil = new Request(url, {
    method: "PUT",
    headers: { origin: "https://evil.example" },
  });
  assert.equal(assertSessionWriteSameOrigin(evil, session)?.status, 403);
  assert.equal(assertSessionWriteSameOrigin(evil, bearer), null);
});

test("admitCookieCapableWrite blocks cookie CSRF before rate-limit consume", () => {
  const env = { WRITE_TRUSTED_PROXY: "test", NODE_ENV: "test" };
  const session = classifyWriteAuth({ sessionUserId: "csrf-user" });
  assert.ok(session);
  const denied = admitCookieCapableWrite(
    new Request("https://anime-tier-board.vercel.app/api/boards", {
      method: "PUT",
    }),
    session,
    "userWrite",
    env
  );
  assert.equal(denied?.status, 403);
  assert.equal(getWriteAdmissionBucketCountForTests("userWrite:user:csrf-user"), 0);

  const bearer = classifyWriteAuth({ bearerUserId: "csrf-user" });
  assert.ok(bearer);
  const allowed = admitCookieCapableWrite(
    new Request("https://anime-tier-board.vercel.app/api/boards", {
      method: "PUT",
      headers: { "x-test-client-ip": "198.51.100.90" },
    }),
    bearer,
    "userWrite",
    env
  );
  assert.equal(allowed, null);
  assert.equal(getWriteAdmissionBucketCountForTests("userWrite:user:csrf-user"), 1);
});

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

test("valid Bearer skips auth(); invalid Bearer calls auth() exactly once", async () => {
  const counters = { bearer: 0, session: 0 };

  const valid = await resolveWriteIdentityFromLookups({
    getBearerUserId: async () => {
      counters.bearer += 1;
      return "native-1";
    },
    getSessionUserId: async () => {
      counters.session += 1;
      return "web-1";
    },
  });
  assert.deepEqual(valid, { userId: "native-1", source: "bearer" });
  assert.equal(counters.bearer, 1);
  assert.equal(counters.session, 0);

  counters.bearer = 0;
  counters.session = 0;
  const fallback = await resolveWriteIdentityFromLookups({
    getBearerUserId: async () => {
      counters.bearer += 1;
      return null;
    },
    getSessionUserId: async () => {
      counters.session += 1;
      return "web-1";
    },
  });
  assert.deepEqual(fallback, { userId: "web-1", source: "session" });
  assert.equal(counters.bearer, 1);
  assert.equal(counters.session, 1);

  counters.bearer = 0;
  counters.session = 0;
  const none = await resolveWriteIdentityFromLookups({
    getBearerUserId: async () => {
      counters.bearer += 1;
      return null;
    },
    getSessionUserId: async () => {
      counters.session += 1;
      return null;
    },
  });
  assert.equal(none, null);
  assert.equal(counters.bearer, 1);
  assert.equal(counters.session, 1);
});

test("malformed or expired Bearer is treated as invalid and falls back to session once", async () => {
  for (const name of ["JWTInvalid", "JWTExpired", "JWEInvalid"]) {
    const counters = { bearer: 0, session: 0 };
    const identity = await resolveWriteIdentityFromLookups({
      getBearerUserId: () =>
        readBearerUserIdForWrite(async () => {
          counters.bearer += 1;
          throw namedError(name, "token validation failed");
        }),
      getSessionUserId: async () => {
        counters.session += 1;
        return "web-session";
      },
    });
    assert.deepEqual(identity, { userId: "web-session", source: "session" }, name);
    assert.equal(counters.bearer, 1, name);
    assert.equal(counters.session, 1, name);
  }
});

test("Bearer token-validation failure without session is unauthorized, not a throw from JWT", async () => {
  const identity = await resolveWriteIdentityFromLookups({
    getBearerUserId: () =>
      readBearerUserIdForWrite(async () => {
        throw namedError("JWTInvalid", "bad compact");
      }),
    getSessionUserId: async () => null,
  });
  assert.equal(identity, null);
});

test("unrelated Bearer lookup errors are not swallowed and do not call auth()", async () => {
  const sessionCalls = { n: 0 };

  await assert.rejects(
    () =>
      resolveWriteIdentityFromLookups({
        getBearerUserId: () =>
          readBearerUserIdForWrite(async () => {
            throw new Error("NATIVE_AUTH_SECRET is not configured");
          }),
        getSessionUserId: async () => {
          sessionCalls.n += 1;
          return "web-1";
        },
      }),
    /NATIVE_AUTH_SECRET is not configured/
  );
  assert.equal(sessionCalls.n, 0);

  await assert.rejects(
    () =>
      resolveWriteIdentityFromLookups({
        getBearerUserId: () =>
          readBearerUserIdForWrite(async () => {
            throw new Error("turso database unavailable");
          }),
        getSessionUserId: async () => {
          sessionCalls.n += 1;
          return "web-1";
        },
      }),
    /turso database unavailable/
  );
  assert.equal(sessionCalls.n, 0);

  assert.equal(
    isBearerTokenValidationFailure(namedError("JWTExpired", "expired")),
    true
  );
  assert.equal(
    isBearerTokenValidationFailure(namedError("JWEInvalid", "Invalid Compact JWE")),
    true
  );
  assert.equal(
    isBearerTokenValidationFailure(new Error("NATIVE_AUTH_SECRET is not configured")),
    false
  );
  assert.equal(
    isBearerTokenValidationFailure(new Error("no matching decryption secret")),
    false
  );
  assert.equal(
    isBearerTokenValidationFailure(namedError("JOSEError", "generic jose failure")),
    false
  );
  assert.equal(
    isBearerTokenValidationFailure(namedError("JWEDecryptionFailed", "decryption operation failed")),
    false
  );
  assert.equal(
    isBearerTokenValidationFailure(namedError("JWSSignatureVerificationFailed", "signature verification failed")),
    false
  );
  assert.equal(
    isBearerTokenValidationFailure(new Error("libsql failed")),
    false
  );
});

const NATIVE_TEST_SECRET = "atb-native-test-secret-32chars-min";

async function withNativeSecret<T>(
  secret: string,
  fn: () => Promise<T>
): Promise<T> {
  const previous = process.env.NATIVE_AUTH_SECRET;
  process.env.NATIVE_AUTH_SECRET = secret;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.NATIVE_AUTH_SECRET;
    } else {
      process.env.NATIVE_AUTH_SECRET = previous;
    }
  }
}

test("real native helper: no matching decryption secret propagates and does not call auth()", async () => {
  const token = await encode({
    token: { sub: "native-1", sid: "sess-1" },
    secret: "atb-other-secret-32chars-minimum",
    salt: NATIVE_SESSION_SALT,
    maxAge: 3600,
  });
  const sessionCalls = { n: 0 };

  await withNativeSecret(NATIVE_TEST_SECRET, async () => {
    await assert.rejects(
      () =>
        resolveWriteIdentityFromLookups({
          getBearerUserId: () =>
            readBearerUserIdForWrite(() =>
              getUserIdFromAuthorizationHeader(`Bearer ${token}`)
            ),
          getSessionUserId: async () => {
            sessionCalls.n += 1;
            return "web-1";
          },
        }),
      /no matching decryption secret/
    );
  });
  assert.equal(sessionCalls.n, 0);
});

test("real native helper: malformed compact JWE falls back to session once", async () => {
  const counters = { session: 0 };
  const identity = await withNativeSecret(NATIVE_TEST_SECRET, () =>
    resolveWriteIdentityFromLookups({
      getBearerUserId: () =>
        readBearerUserIdForWrite(() =>
          getUserIdFromAuthorizationHeader("Bearer not-a-jwt")
        ),
      getSessionUserId: async () => {
        counters.session += 1;
        return "web-session";
      },
    })
  );
  assert.deepEqual(identity, { userId: "web-session", source: "session" });
  assert.equal(counters.session, 1);
});

test("real native helper: expired token falls back to session once", async () => {
  const token = await withNativeSecret(NATIVE_TEST_SECRET, () =>
    encode({
      token: { sub: "native-1", sid: "sess-exp" },
      secret: NATIVE_TEST_SECRET,
      salt: NATIVE_SESSION_SALT,
      maxAge: -120,
    })
  );
  const counters = { session: 0 };
  const identity = await withNativeSecret(NATIVE_TEST_SECRET, () =>
    resolveWriteIdentityFromLookups({
      getBearerUserId: () =>
        readBearerUserIdForWrite(() =>
          getUserIdFromAuthorizationHeader(`Bearer ${token}`)
        ),
      getSessionUserId: async () => {
        counters.session += 1;
        return "web-session";
      },
    })
  );
  assert.deepEqual(identity, { userId: "web-session", source: "session" });
  assert.equal(counters.session, 1);
});


