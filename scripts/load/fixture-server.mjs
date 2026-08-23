#!/usr/bin/env node
/**
 * ATB-745-S1 — loopback-only read fixture server.
 * No outbound network. Fixed modes + test injection (delay / 429 / 500 / amplification).
 */
import http from "node:http";
import { once } from "node:events";

export const FIXTURE_MODES = Object.freeze({
  cold_miss_fresh: Object.freeze({
    cache: "miss",
    freshness: "fresh",
    turso_calls: 0,
    external_calls: 0,
    status: 200,
  }),
  warm_hit_fresh: Object.freeze({
    cache: "hit",
    freshness: "fresh",
    turso_calls: 0,
    external_calls: 0,
    status: 200,
  }),
  warm_stale: Object.freeze({
    cache: "hit",
    freshness: "stale",
    turso_calls: 0,
    external_calls: 0,
    status: 200,
  }),
  unavailable: Object.freeze({
    cache: "miss",
    freshness: "unavailable",
    turso_calls: 0,
    external_calls: 0,
    status: 200,
  }),
});

export const MATRIX_ORDER = Object.freeze([
  "cold_miss_fresh",
  "warm_hit_fresh",
  "warm_stale",
  "unavailable",
]);

function parseIntParam(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveMode(url) {
  const fromQuery = url.searchParams.get("mode");
  if (fromQuery && Object.hasOwn(FIXTURE_MODES, fromQuery)) return fromQuery;
  const parts = url.pathname.split("/").filter(Boolean);
  // /mode/<name> or /api/anime/seasonal?mode=
  if (parts[0] === "mode" && parts[1] && Object.hasOwn(FIXTURE_MODES, parts[1])) {
    return parts[1];
  }
  return "warm_hit_fresh";
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function buildFixturePayload(modeName, injection = {}) {
  const base = FIXTURE_MODES[modeName] ?? FIXTURE_MODES.warm_hit_fresh;
  let turso_calls = base.turso_calls;
  let external_calls = base.external_calls;
  let freshness = base.freshness;
  let cache = base.cache;
  let status = injection.status ?? base.status;
  let malformed = Boolean(injection.malformed);

  if (injection.amplify_external) {
    external_calls = Math.max(1, Number(injection.amplify_external) || 1);
  }
  if (injection.turso_error) {
    turso_calls = 1;
    status = injection.status ?? 500;
  }
  if (injection.override_freshness) freshness = injection.override_freshness;
  if (injection.override_cache) cache = injection.override_cache;

  const metrics = malformed
    ? { turso_calls: "NaN", external_calls: { bad: true } }
    : {
        turso_calls,
        external_calls,
        ...(injection.turso_error ? { turso_error: true } : {}),
      };

  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      connection: "close",
      "x-atb-cache": String(cache),
      "x-atb-freshness": String(freshness),
      "x-atb-turso-calls": malformed ? "not-a-number" : String(turso_calls),
      "x-atb-external-calls": malformed ? "oops" : String(external_calls),
      "x-atb-mode": modeName,
      ...(injection.turso_error ? { "x-atb-turso-error": "1" } : {}),
    },
    body: {
      ok: status >= 200 && status < 300,
      mode: modeName,
      freshness,
      cache,
      metrics,
      items: [],
      generatedAt: new Date().toISOString(),
    },
  };
}

export function createFixtureRequestListener(options = {}) {
  const onRequest = options.onRequest ?? null;
  return async function listener(req, res) {
    onRequest?.(req);
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          allow: "GET, HEAD, OPTIONS",
          "access-control-allow-origin": "*",
        });
        res.end();
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, {
          allow: "GET, HEAD, OPTIONS",
          "content-type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }

      const host = req.headers.host ?? "127.0.0.1";
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, service: "atb-745-fixture" }));
        return;
      }

      const modeName = resolveMode(url);
      const delayMs = Math.max(0, parseIntParam(url.searchParams.get("delay_ms"), 0) ?? 0);
      const statusOverride = parseIntParam(url.searchParams.get("status"), null);
      const amplify = parseIntParam(url.searchParams.get("amplify_external"), 0) ?? 0;
      const malformed =
        url.searchParams.get("malformed") === "1" ||
        url.searchParams.get("malformed") === "true";
      const tursoError =
        url.searchParams.get("turso_error") === "1" ||
        url.searchParams.get("turso_error") === "true";

      if (delayMs > 0) {
        await sleep(delayMs);
      }

      const payload = buildFixturePayload(modeName, {
        status: statusOverride ?? undefined,
        amplify_external: amplify > 0 ? amplify : 0,
        malformed,
        turso_error: tursoError,
      });

      res.writeHead(payload.status, payload.headers);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(JSON.stringify(payload.body));
    } catch (err) {
      if (err?.name === "AbortError") {
        res.destroy();
        return;
      }
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      }
      res.end(JSON.stringify({ ok: false, error: "fixture_internal_error" }));
    }
  };
}

/**
 * Start a loopback fixture server on a random free port.
 * @returns {Promise<{ server: import('node:http').Server, port: number, baseUrl: string, close: () => Promise<void> }>}
 */
export async function startFixtureServer(options = {}) {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(`fixture server host must be loopback, got ${host}`);
  }
  const server = http.createServer(createFixtureRequestListener(options));
  server.listen(0, host);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("failed to bind fixture server to ephemeral port");
  }
  const port = address.port;
  const baseUrl = `http://${host}:${port}`;
  return {
    server,
    port,
    baseUrl,
    close: () =>
      new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        try {
          server.close(() => done());
        } catch {
          done();
          return;
        }
        // Do not call closeAllConnections: on Windows it can trip UV_HANDLE_CLOSING.
        const timer = setTimeout(done, 100);
        timer.unref?.();
      }),
  };
}

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/load/fixture-server.mjs [--host 127.0.0.1]",
      "Starts a loopback-only seasonal-read fixture. Prints JSON { baseUrl, port }.",
      "",
    ].join("\n"),
  );
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return 0;
  }
  let host = "127.0.0.1";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--host" && argv[i + 1]) {
      host = argv[++i];
    }
  }
  const started = await startFixtureServer({ host });
  process.stdout.write(
    `${JSON.stringify({ ok: true, baseUrl: started.baseUrl, port: started.port })}\n`,
  );
  const shutdown = async () => {
    try {
      await started.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return undefined;
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("fixture-server.mjs") ||
    process.argv[1].replaceAll("\\", "/").endsWith("scripts/load/fixture-server.mjs"));

if (isDirect) {
  main().catch((err) => {
    process.stderr.write(`${err?.stack || err}\n`);
    process.exit(2);
  });
}
