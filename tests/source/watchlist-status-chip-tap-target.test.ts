import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const watchlistCss = readFileSync(
  path.join(projectRoot, "app/watchlist/watchlist-v2-grok.css"),
  "utf8"
);

test(".wl2g-status-chip keeps a 44px minimum tap target", () => {
  const rule = /\.wl2g-status-chip\s*\{([^}]*)\}/;
  const match = watchlistCss.match(rule);
  assert.ok(match, "Missing .wl2g-status-chip rule");
  const body = match[1];

  assert.match(
    body,
    /min-height:\s*44px/,
    ".wl2g-status-chip must use a 44px minimum tap target"
  );
});

test(".wl2g-status-chip has a visible focus style", () => {
  const rule = /\.wl2g-status-chip:focus-visible\s*\{([^}]*)\}/;
  const match = watchlistCss.match(rule);
  assert.ok(match, ".wl2g-status-chip must define a :focus-visible outline");
});
