import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/onboarding/onboarding-client.tsx", "utf8");
const homeClientSource = readFileSync("app/home-client.tsx", "utf8");

test("onboarding completion sends users to first-anime add section", () => {
  assert.match(source, /const FIRST_ANIME_TARGET = "\/\#home-add-section";/);
  assert.equal(source.match(/router\.replace\(FIRST_ANIME_TARGET\)/g)?.length, 2);
});

test("onboarding copy frames subscriptions as optional setup before choosing anime", () => {
  assert.match(source, /気になる1本を選びましょう/);
  assert.match(source, /保存またはスキップ後、今期の作品から「見たい」「視聴中」に追加する画面へ移動します。/);
  assert.match(source, /submitLabel="保存して作品を選ぶ"/);
  assert.match(source, /skipLabel="スキップして作品を選ぶ"/);
  assert.doesNotMatch(source, /今入ってるサブスクを教えてください/);
});

test("WelcomeModal component file is absent (guest entry is HomeGuest/guide)", () => {
  assert.equal(existsSync("components/WelcomeModal.tsx"), false);
  assert.doesNotMatch(homeClientSource, /WelcomeModal/);
  const homeGuestSource = readFileSync("app/home-guest.tsx", "utf8");
  assert.doesNotMatch(homeGuestSource, /WelcomeModal/);
  const pageSource = readFileSync("app/page.tsx", "utf8");
  assert.doesNotMatch(pageSource, /WelcomeModal/);
});

test("HomeAddSection remains outside the onboarding-dismiss conditional in HomeEmptyGuide", () => {
  // Structural: showOnboarding wraps only the home-guide section; addSection is a sibling after it.
  const normalized = homeClientSource.replace(/\r\n/g, "\n");
  const emptyGuideFn = normalized.match(
    /export function HomeEmptyGuide\([\s\S]*?\n\}\n?$/
  )?.[0] ?? normalized.match(
    /export function HomeEmptyGuide\([\s\S]*?\n\}/
  )?.[0];
  assert.ok(emptyGuideFn, "HomeEmptyGuide function body should be present");

  // onboarding block is conditional; addSection must not be nested inside that ternary arm.
  assert.match(
    emptyGuideFn,
    /\{showOnboarding \? \([\s\S]*?<section className="home-guide"[\s\S]*?<\/section>\s*\) : null\}\s*\{addSection\}/
  );

  // Dismiss ("あとで") lives only inside the onboarding section, not around addSection.
  const afterOnboarding = emptyGuideFn.split(/\) : null\}/)[1] ?? "";
  assert.match(afterOnboarding, /\{addSection\}/);
  assert.doesNotMatch(afterOnboarding, /あとで/);
  assert.doesNotMatch(afterOnboarding, /showOnboarding/);
});
