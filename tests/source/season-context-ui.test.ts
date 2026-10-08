import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");

function read(rel: string): string {
  return readFileSync(path.join(projectRoot, rel), "utf8");
}

test("season context control is keyboard-accessible with 44px targets", () => {
  const control = read("components/SeasonContextControl.tsx");
  const css = read("app/globals.css");
  assert.match(control, /aria-label="年とクール"/);
  assert.match(control, /aria-label="年"/);
  assert.match(control, /aria-label="クール"/);
  assert.match(control, /前の期/);
  assert.match(control, /次の期/);
  assert.match(control, /currentSeasonLabelJa/);
  assert.match(control, /selectedSeasonLabelJa/);
  assert.match(control, /autoDetectedSeasonLabelJa/);
  assert.match(css, /\.season-context-adjacent \.command-button \{[\s\S]*min-height: 44px;/);
  assert.match(css, /\.field select \{[\s\S]*min-height: 44px;/);
  assert.match(css, /grid-template-columns: 1fr 1fr/);
});

test("canonical five-tab nav has no analysis or feature-flag branch", () => {
  const globalNav = read("components/GlobalNav.tsx");
  assert.match(globalNav, /label: "ホーム"/);
  assert.match(globalNav, /label: "今期チェック"/);
  assert.match(globalNav, /label: "マイリスト"/);
  assert.match(globalNav, /label: "さがす"/);
  assert.match(globalNav, /label: "マイページ"/);
  assert.doesNotMatch(globalNav, /label: "分析"|useNavV5|ownerOnly/);
  assert.match(globalNav, /seasonAwareHref/);
  const mobileNav = read("components/MobileNav.tsx");
  assert.match(mobileNav, /seasonAwareHref/);
  assert.doesNotMatch(mobileNav, /NAV_ITEMS_V5|useNavV5|numanie:nav-v5|label: "分析"/);
});

test("active subscription navigation bypasses the retired dashboard route", () => {
  const manifest = read("app/manifest.ts");
  const hamburger = read("components/HamburgerMenu.tsx");
  assert.match(manifest, /url:\s*"\/subscriptions"/);
  assert.doesNotMatch(manifest + hamburger, /\/dashboard\?section=subscriptions/);
});

test("canonical parser is used by seasonal API, boards, and season landing", () => {
  assert.match(read("app/api/anime/seasonal/route.ts"), /parseSeasonYear/);
  assert.match(read("app/api/anime/seasonal/route.ts"), /normalizeSeason/);
  assert.match(read("app/api/boards/route.ts"), /parseSeasonYear/);
  assert.match(read("app/seasons/[year]/[season]/page.tsx"), /parseSeasonPathParts/);
  assert.match(read("app/seasons/[year]/[season]/page.tsx"), /getPreviousAnimeSeason\(\)/);
});

test("season writers compose the next URL from live location or latest committed ref", () => {
  const control = read("components/SeasonContextControl.tsx");
  assert.match(control, /mergeSeasonPatch/);
  assert.match(control, /readSeasonContextFromLocation/);
  assert.match(control, /liveCanonical/);
  assert.match(control, /pendingRef/);
  assert.match(control, /navigationMode === "path"/);

  const hook = read("components/useSeasonUrlState.ts");
  assert.match(hook, /window\.location\.search/);
  assert.match(hook, /history\.pushState/);
  assert.match(hook, /popstate/);
  assert.doesNotMatch(hook, /router\.push/);
  assert.doesNotMatch(hook, /router\.replace/);
  for (const file of ["components/useSeasonUrlState.ts", "components/TierBoardApp.tsx", "app/explore/explore-client.tsx"]) {
    assert.doesNotMatch(read(file), /history\.(?:pushState|replaceState)\(window\.history\.state/,
      "Next.js internal history state must not bypass URL synchronization");
  }

  const explore = read("app/explore/explore-client.tsx");
  assert.match(explore, /window\.location\.search/);
  assert.match(explore, /history\.pushState/);
  assert.match(explore, /popstate/);

  const tier = read("components/TierBoardApp.tsx");
  assert.match(tier, /window\.location\.search/);
  assert.match(tier, /history\.pushState/);
  assert.match(tier, /popstate/);

  const landing = read("app/seasons/[year]/[season]/page.tsx");
  assert.match(landing, /navigationMode="path"/);
});

test("mobile Tier destination is discoverable in all display modes without a sixth global slot", () => {
  const nav = read("components/MobileNav.tsx");
  const canonical = nav.match(/const NAV_ITEMS: NavItem\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.deepEqual([...canonical.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]),
    ["/", "/tier", "/explore", "/watchlist", "/mypage"]);
  assert.match(nav, /今期チェック/);
  assert.match(nav, /"\/tier\/impressions"/);
  assert.match(nav, /pathname\.startsWith\(item\.href \+ "\/"\)/);
  assert.doesNotMatch(nav, /useDisplayMode|useUiMode/);
  assert.match(read("components/AppShell.tsx"), /<TierAreaNav\s*\/>/);
});

test("historical Tier queries cannot seed their cache with the current season SSR list", () => {
  assert.match(read("app/tier/page.tsx"),
    /if \(initialYear === current\.year && initialSeason === current\.season\) \{\s*initialSeasonalAnime = await fetchCurrentSeasonAnimeForHome\(\)/);
});
