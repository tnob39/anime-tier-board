import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

function ruleBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Missing ${selector} rule block`);
  return match[1];
}

test(".emphasis-button hover state uses semantic accent tokens, not fixed hex colors", () => {
  const hoverRule = ruleBlock(".emphasis-button:hover:not(:disabled)");

  assert.doesNotMatch(
    hoverRule,
    /#[0-9a-f]{3,8}\b/i,
    "emphasis-button hover must not hardcode hex colors; the base rule already reads background/color from var(--accent)/var(--accent-ink), so a fixed hex hover state drifts out of sync per theme (e.g. flips a bright dark-theme accent to a dark navy hover)"
  );

  assert.match(
    hoverRule,
    /background:\s*color-mix\(in srgb,\s*var\(--accent\)/,
    "emphasis-button hover background must derive from var(--accent)"
  );
  assert.match(
    hoverRule,
    /color:\s*var\(--accent-ink\)/,
    "emphasis-button hover text color must stay var(--accent-ink) to match the base state's contrast pairing"
  );
});
