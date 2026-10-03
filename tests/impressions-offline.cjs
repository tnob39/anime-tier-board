// Preload for local App Router proofs/builds: no outbound TCP or fetch, including SSR.
const net = require("node:net");
const loopback = (host) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const value = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof value[0] === "object" ? value[0] : typeof value[0] === "number" ? { host: value[1] } : { path: value[0] };
  if (!options.path && options.host && typeof options.host === "string" && !loopback(options.host)) {
    throw new Error(`Offline impression proof blocked outbound TCP: ${options.host}`);
  }
  return connect.apply(this, args);
};
const fetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!loopback(url.hostname)) throw new Error(`Offline impression proof blocked outbound fetch: ${url.hostname}`);
  return fetch(input, init);
};
