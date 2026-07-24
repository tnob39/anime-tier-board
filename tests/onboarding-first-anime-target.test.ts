import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/onboarding/onboarding-client.tsx", "utf8");

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
