import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

/**
 * These selectors paint text on top of `var(--accent)`. In dark theme
 * `--accent` is a bright mint (#2dd4bf) and `--accent-ink` resolves to a
 * dark ink (#06231d) for contrast; a hardcoded `color: #fff` instead of
 * `var(--accent-ink)` makes the label low-contrast on that background.
 */
const SELECTORS = [".dashboard-updates-badge", ".whats-new-badge", ".rhythm-chip.is-active"];

test("accent-background badges reference --accent-ink, not a hardcoded white", () => {
  for (const selector of SELECTORS) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
    const match = globalsCss.match(rule);
    assert.ok(match, `Missing rule for ${selector}`);
    const body = match[1];

    assert.match(body, /background:\s*var\(--accent\)/, `${selector} must use var(--accent) background`);
    assert.match(body, /color:\s*var\(--accent-ink\)/, `${selector} must use var(--accent-ink) for text color`);
    assert.doesNotMatch(body, /color:\s*#fff/i, `${selector} must not hardcode a white text color`);
  }
});
