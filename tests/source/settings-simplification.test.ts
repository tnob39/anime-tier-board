import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");

function read(rel: string): string {
  return readFileSync(path.join(projectRoot, rel), "utf8");
}

test("settings renders only compact data management controls", () => {
  const page = read("app/settings/page.tsx");
  const client = read("app/settings/settings-client.tsx");

  assert.doesNotMatch(page, /getSubscriptionState|initialServiceIds/);
  assert.match(client, />データ管理</);
  assert.match(client, /showDeleteConfirm/);
  assert.match(client, /Google側に残る情報/);
  assert.match(client, /role=\{exportState === "failure" \? "alert" : "status"\}/);
  assert.doesNotMatch(
    client,
    /PushToggle|SubscriptionPicker|readNavV5|setNavV5|useSession|サブスク診断|ベータ機能|分析へ/
  );
});

test("retired nav flag is absent after canonical five-tab rollout", () => {
  assert.equal(existsSync(path.join(projectRoot, "lib/nav-flag.ts")), false);
  const settings = read("app/settings/settings-client.tsx");
  const mobileNav = read("components/MobileNav.tsx");
  const globalNav = read("components/GlobalNav.tsx");
  const activeNavTests = [
    read("tests/season-context.spec.ts"),
    read("tests/mobile-responsive.spec.ts"),
    read("tests/owner-comment-inbox-browser.test.mjs"),
  ].join("\n");
  assert.doesNotMatch(settings + mobileNav + globalNav + activeNavTests, /numanie:nav-v5|setNavV5|useNavV5/);
});

test("push backend and service worker remain while settings UI is hidden", () => {
  assert.equal(existsSync(path.join(projectRoot, "app/api/push/subscribe/route.ts")), true);
  assert.equal(existsSync(path.join(projectRoot, "components/PushToggle.tsx")), true);
  assert.equal(existsSync(path.join(projectRoot, "public/sw.js")), true);
});