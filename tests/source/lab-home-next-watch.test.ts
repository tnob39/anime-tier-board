import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONFIRMED_WATCH_HREF,
  getCandidate,
  isAllowedWatchHref,
  isEligibleWatchCta,
  isValidIsoUtcInstant,
  type LabTonightCandidate
} from "../../app/lab/home-next-watch/fixtures.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const labDir = path.join(projectRoot, "app/lab/home-next-watch");

const css = readFileSync(path.join(labDir, "home-next-watch.css"), "utf8");
const fixtures = readFileSync(path.join(labDir, "fixtures.ts"), "utf8");
const culture = readFileSync(path.join(labDir, "culture-check.ts"), "utf8");
const client = readFileSync(path.join(labDir, "home-next-watch-client.tsx"), "utf8");
const page = readFileSync(path.join(labDir, "page.tsx"), "utf8");

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*,\\s*\\n[\\s\\S]*?\\{([^}]*)\\}`));
  if (match) {
    return match[1];
  }
  const single = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(single, `Missing CSS rule for ${selector}`);
  return single[1];
}

test("interactive lab controls share a 44px minimum tap target", () => {
  const body = ruleBody(".hnw-mode-btn");
  assert.match(body, /min-height:\s*44px/);
  assert.match(body, /min-width:\s*44px/);
  assert.match(
    css,
    /\.hnw-mode-btn,\s*\n\.hnw-candidate,\s*\n\.hnw-primary-cta\s*\{/,
    "mode, candidate, and primary CTA must share the 44px rule"
  );
});

test("lab controls define a visible :focus-visible outline", () => {
  assert.match(css, /\.hnw-mode-btn:focus-visible/);
  assert.match(css, /\.hnw-candidate:focus-visible/);
  assert.match(css, /\.hnw-primary-cta:focus-visible/);
  const focusBlock = css.match(
    /\.hnw-mode-btn:focus-visible,[\s\S]*?\.hnw-primary-cta:focus-visible\s*\{([^}]*)\}/
  );
  assert.ok(focusBlock, "shared focus-visible block is missing");
  assert.match(focusBlock[1], /outline:\s*2px\s+solid\s+var\(--accent\)/);
});

test("lab CSS honors prefers-reduced-motion", () => {
  const reduce = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)$/);
  assert.ok(reduce, "missing prefers-reduced-motion media query");
  assert.match(reduce[1], /transition:\s*none/);
  assert.match(reduce[1], /transform:\s*none/);
});

test("lab CSS is self-contained under .hnw and does not target globals", () => {
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]+\{/g, "");
  const selectors = stripped.match(/(^|\n)\s*([.#][^{,/]+)/g) ?? [];
  for (const raw of selectors) {
    const selector = raw.trim();
    if (!selector) continue;
    assert.match(
      selector,
      /^\.hnw/,
      `lab CSS selector must be scoped under .hnw: ${selector}`
    );
  }
  assert.doesNotMatch(css, /\bbody\s*\{/);
  assert.doesNotMatch(css, /\.home-next-action\b/);
});

test("confirmed fixture uses only the allowlisted regional go href", () => {
  assert.match(fixtures, /CONFIRMED_WATCH_HREF = "\/api\/go\/netflix"/);
  assert.match(fixtures, /destinationHref: CONFIRMED_WATCH_HREF/);
  assert.match(fixtures, /region: LAB_REGION/);
  assert.match(fixtures, /CHECKED_AT_JA = "2026年9月1日 12:00（日本時間）"/);
  assert.match(fixtures, /source: CONFIRMED_SOURCE/);
});

test("unavailable fixture has no destination href and does not invent a provider link", () => {
  const unavailableBlock = fixtures.match(
    /id: "unavailable",[\s\S]*?imageUrl: null\s*\}/
  )?.[0];
  assert.ok(unavailableBlock, "unavailable fixture is missing");
  assert.match(unavailableBlock, /availability: "unknown"/);
  assert.match(unavailableBlock, /destinationHref: null/);
  assert.match(unavailableBlock, /serviceId: null/);
  assert.match(unavailableBlock, /serviceName: null/);
  assert.doesNotMatch(unavailableBlock, /\/api\/go\//);
  assert.doesNotMatch(unavailableBlock, /https?:\/\//);
});

test("fixtures do not invent absolute provider URLs", () => {
  assert.doesNotMatch(fixtures, /https?:\/\//);
  assert.doesNotMatch(client, /https?:\/\//);
  assert.match(client, /isEligibleWatchCta/);
  assert.match(client, /candidate\.destinationHref/);
  assert.match(client, /data-hnw-watch-link/);
  assert.match(client, /正規の視聴先は未確認です/);
  assert.doesNotMatch(client, /availability === "confirmed"/);
});

test("CTA eligibility is fail-closed and requires provenance plus an allowlisted href", () => {
  const confirmed = getCandidate("confirmed");
  const unavailable = getCandidate("unavailable");
  const missing = getCandidate("missing-provenance");

  assert.equal(isEligibleWatchCta(confirmed), true);
  assert.equal(isAllowedWatchHref(confirmed.destinationHref), true);

  assert.equal(unavailable.availability, "unknown");
  assert.equal(isEligibleWatchCta(unavailable), false);

  assert.equal(missing.availability, "confirmed");
  assert.equal(missing.destinationHref, CONFIRMED_WATCH_HREF);
  assert.equal(isAllowedWatchHref(missing.destinationHref), true);
  assert.equal(isEligibleWatchCta(missing), false);

  const withBlankSource: LabTonightCandidate = { ...confirmed, source: "   " };
  const withUnsupportedRegion: LabTonightCandidate = { ...confirmed, region: "US" };
  const withInvalidCheckedAt: LabTonightCandidate = {
    ...confirmed,
    checkedAtIso: "not-an-instant"
  };
  const withAbsoluteHref: LabTonightCandidate = {
    ...confirmed,
    destinationHref: "https://www.netflix.com/jp/"
  };
  const withProtocolRelative: LabTonightCandidate = {
    ...confirmed,
    destinationHref: "//evil.example/watch"
  };

  assert.equal(isEligibleWatchCta(withBlankSource), false);
  assert.equal(isEligibleWatchCta(withUnsupportedRegion), false);
  assert.equal(isEligibleWatchCta(withInvalidCheckedAt), false);
  assert.equal(isEligibleWatchCta(withAbsoluteHref), false);
  assert.equal(isAllowedWatchHref(withAbsoluteHref.destinationHref), false);
  assert.equal(isEligibleWatchCta(withProtocolRelative), false);
  assert.equal(isAllowedWatchHref(withProtocolRelative.destinationHref), false);
});

test("impossible calendar timestamps fail closed even when Date.parse accepts them", () => {
  const impossibleIso = "2026-02-30T03:00:00.000Z";
  assert.equal(Number.isFinite(Date.parse(impossibleIso)), true);
  assert.equal(isValidIsoUtcInstant(impossibleIso), false);
  assert.equal(isValidIsoUtcInstant("2026-09-01T03:00:00.000Z"), true);
  assert.equal(isValidIsoUtcInstant("2026-02-30T03:00:00Z"), false);
  assert.equal(isValidIsoUtcInstant("2026-13-01T03:00:00.000Z"), false);

  const impossible = getCandidate("impossible-timestamp");
  assert.equal(impossible.availability, "confirmed");
  assert.equal(impossible.destinationHref, CONFIRMED_WATCH_HREF);
  assert.equal(isAllowedWatchHref(impossible.destinationHref), true);
  assert.equal(impossible.source.trim().length > 0, true);
  assert.equal(impossible.region, "JP");
  assert.equal(impossible.checkedAtIso, impossibleIso);
  assert.equal(isEligibleWatchCta(impossible), false);
});

test("Japanese UI copy is the canonical surface", () => {
  assert.match(client, /今夜の1本/);
  assert.match(client, /次の一手/);
  assert.match(client, /今夜見る作品/);
  assert.match(client, /文化循環チェック/);
  assert.match(page, /今夜の1本 Lab/);
  assert.match(client, /出典/);
  assert.match(client, /地域/);
  assert.match(client, /確認日時/);
});

test("Visual and Simple share the same lab actions in source", () => {
  assert.match(client, /value: "visual"/);
  assert.match(client, /value: "simple"/);
  assert.match(client, /aria-label="表示モード"/);
  assert.match(client, /mode === "visual"/);
  assert.doesNotMatch(client, /mode === "simple"[\s\S]{0,80}return null/);
});

test("visible culture-cycle check covers UX_DIRECTION §1.8 ids", () => {
  const requiredIds = [
    "loop",
    "legal-watch",
    "canonical",
    "creators",
    "rating",
    "source",
    "preserve",
    "metric",
    "ia",
    "scope",
    "access"
  ];
  for (const id of requiredIds) {
    assert.match(culture, new RegExp(`id: "${id}"`));
  }
  assert.match(client, /data-hnw-culture-check="true"/);
  assert.match(client, /CULTURE_CYCLE_CHECKS\.map/);
  assert.match(culture, /UX_DIRECTION\.md §1\.8/);
});
