import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MY_LIST_FIXTURES } from "../../app/lab/my-list-next/fixtures.ts";
import {
  LAB_NOW_ISO,
  classifyWork,
  classifyWorkRecord,
  classifyWorks,
  countStates,
  equivalentView,
  filterWorks,
  formatExpiry,
  isApprovedSource,
  keepWatchingAction,
  primaryActionFor,
  remainingEpisodes,
  resolveExpiry,
  resolveLegalWatch,
  suggestNextWork,
  type SavedWork
} from "../../app/lab/my-list-next/model.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const labDir = path.join(projectRoot, "app/lab/my-list-next");

const NOW = new Date(LAB_NOW_ISO);

function readLab(file: string): string {
  return readFileSync(path.join(labDir, file), "utf8");
}

function synthetic(overrides: Partial<SavedWork>): SavedWork {
  return {
    id: "synthetic",
    titleNative: "合成作品",
    titleRomaji: null,
    status: "watching",
    watchedEpisodes: 1,
    latestKnownEpisode: null,
    lastTouchedAt: LAB_NOW_ISO,
    savedAt: LAB_NOW_ISO,
    posterTone: "#123",
    expiry: resolveExpiry({}),
    legalWatch: resolveLegalWatch({}),
    ...overrides
  };
}

test("classifies fixtures into 未消化 / 長期放置 / 配信終了間近", () => {
  const classified = classifyWorks(MY_LIST_FIXTURES, NOW);
  const byId = Object.fromEntries(classified.map((work) => [work.id, work.state]));

  assert.deepEqual(byId, {
    "uw-frieren": "unwatched",
    "uw-kusuriya": "unwatched",
    "dm-heike": "dormant",
    "dm-yojo": "dormant",
    "ex-mujica": "expiring",
    "ex-witch": "expiring",
    "fail-region": "unwatched",
    "fail-source": "unwatched",
    "fail-checked": "unwatched",
    "fail-date": "dormant",
    "fail-unofficial": "dormant",
    "fail-spoof-host": "unwatched",
    "fail-spoof-userinfo": "unwatched"
  });

  const counts = countStates(classified);
  assert.equal(counts.unwatched >= 1, true);
  assert.equal(counts.dormant >= 1, true);
  assert.equal(counts.expiring >= 1, true);
  assert.equal(
    counts.unwatched + counts.dormant + counts.expiring,
    MY_LIST_FIXTURES.length
  );
});

test("unknown expiry is fail-closed unavailable and never becomes 配信終了間近", () => {
  const classified = classifyWorks(MY_LIST_FIXTURES, NOW);
  const failed = classified.filter((work) => work.id.startsWith("fail-"));

  assert.equal(failed.length, 7);
  for (const work of failed) {
    assert.equal(work.expiry.available, false);
    assert.equal(work.expiry.detail, "unavailable");
    assert.equal(work.state === "expiring", false);
    assert.match(formatExpiry(work.expiry), /unavailable/);
    assert.match(work.expiryLabel, /unavailable/);
  }

  const nearButMissingRegion = synthetic({
    expiry: resolveExpiry({
      expiresAt: "2026-09-21T12:00:00.000Z",
      sourceName: "Netflix",
      sourceUrl: "https://www.netflix.com/title/x",
      region: "",
      checkedAt: "2026-09-20T00:00:00.000Z"
    })
  });
  assert.equal(nearButMissingRegion.expiry.available, false);
  assert.equal(classifyWork(nearButMissingRegion, NOW), "unwatched");

  const unofficialNear = synthetic({
    expiry: resolveExpiry({
      expiresAt: "2026-09-21T12:00:00.000Z",
      sourceName: "動画検索",
      sourceUrl: "https://search.example.invalid/x",
      region: "JP",
      checkedAt: "2026-09-20T00:00:00.000Z"
    })
  });
  assert.equal(unofficialNear.expiry.available, false);
  assert.equal(classifyWork(unofficialNear, NOW), "unwatched");
});

test("spoofed streaming URLs cannot become 配信終了間近 or a legal watch action", () => {
  const nearExpiry = {
    expiresAt: "2026-09-22T12:00:00.000Z",
    sourceName: "Netflix",
    region: "JP",
    checkedAt: "2026-09-20T00:00:00.000Z"
  } as const;
  const nearWatch = {
    providerName: "Netflix",
    region: "JP",
    checkedAt: "2026-09-20T00:00:00.000Z",
    watchForm: "字幕"
  } as const;

  const suffixHost = "https://www.netflix.com.evil/title/x";
  const userinfoToEvil = "https://www.netflix.com@evil.example/title/x";
  const userinfoOnApproved = "https://evil.example@www.netflix.com/title/x";
  const fragment = "https://www.netflix.com/title/x#phish";
  const canonical = "https://www.netflix.com/title/x";

  assert.equal(isApprovedSource("Netflix", canonical), true);
  assert.equal(isApprovedSource("Netflix", suffixHost), false);
  assert.equal(isApprovedSource("Netflix", userinfoToEvil), false);
  assert.equal(isApprovedSource("Netflix", userinfoOnApproved), false);
  assert.equal(isApprovedSource("Netflix", fragment), false);

  for (const url of [suffixHost, userinfoToEvil]) {
    const work = synthetic({
      expiry: resolveExpiry({ ...nearExpiry, sourceUrl: url }),
      legalWatch: resolveLegalWatch({ ...nearWatch, url })
    });
    assert.equal(work.expiry.available, false);
    assert.equal(work.legalWatch.available, false);
    assert.equal(classifyWork(work, NOW), "unwatched");
    const action = primaryActionFor(classifyWorkRecord(work, NOW));
    assert.equal(action.kind, "review-decision");
    assert.notEqual(action.kind, "watch-legal");
    assert.notEqual(action.label, "確認済みの正規配信で見る");
    assert.notEqual(action.label, "続きを正規配信で見る");
    assert.notEqual(action.label, "第1話を正規配信で見る");
  }

  const classified = classifyWorks(MY_LIST_FIXTURES, NOW);
  for (const id of ["fail-spoof-host", "fail-spoof-userinfo"]) {
    const work = classified.find((item) => item.id === id);
    assert.ok(work);
    assert.equal(work.state, "unwatched");
    assert.equal(work.expiry.available, false);
    assert.equal(work.legalWatch.available, false);
    assert.equal(primaryActionFor(work).kind, "review-decision");
  }

  const modelSource = readLab("model.ts");
  assert.match(modelSource, /new URL\(/);
  assert.doesNotMatch(modelSource, /startsWith\(/);
});

test("confirmed expiry uses 14-day window and does not infer past or far dates", () => {
  const confirmed = (expiresAt: string): SavedWork =>
    synthetic({
      expiry: resolveExpiry({
        expiresAt,
        sourceName: "Netflix",
        sourceUrl: "https://www.netflix.com/title/x",
        region: "JP",
        checkedAt: "2026-09-19T00:00:00.000Z"
      })
    });

  assert.equal(classifyWork(confirmed("2026-10-04T12:00:00.000Z"), NOW), "expiring");
  assert.equal(classifyWork(confirmed("2026-10-04T12:00:01.000Z"), NOW), "unwatched");
  assert.equal(classifyWork(confirmed("2026-09-19T12:00:00.000Z"), NOW), "unwatched");
  assert.equal(classifyWork(confirmed("2026-09-20T12:00:00.000Z"), NOW), "expiring");
});

test("does not infer remaining episodes when delivery count is unknown", () => {
  const unknown = synthetic({ watchedEpisodes: 4, latestKnownEpisode: null });
  assert.equal(remainingEpisodes(unknown), null);

  const known = synthetic({ watchedEpisodes: 4, latestKnownEpisode: 10 });
  assert.equal(remainingEpisodes(known), 6);
});

test("Visual and Simple expose the same information and primary action", () => {
  const classified = classifyWorks(MY_LIST_FIXTURES, NOW);
  for (const work of classified) {
    const action = primaryActionFor(work);
    const view = equivalentView(work, action);
    assert.equal(view.title, work.titleNative);
    assert.equal(view.stateLabel === "未消化" || view.stateLabel === "長期放置" || view.stateLabel === "配信終了間近", true);
    assert.equal(view.primaryAction, action.label);
    assert.equal(view.expiryLabel, work.expiryLabel);
    if (!work.expiry.available) {
      assert.match(view.sourceLabel, /unavailable/);
      assert.match(view.regionLabel, /unavailable/);
      assert.match(view.checkedAtLabel, /unavailable/);
    } else {
      assert.match(view.sourceLabel, new RegExp(work.expiry.sourceName));
      assert.match(view.regionLabel, new RegExp(work.expiry.region));
      assert.match(view.checkedAtLabel, /確認 /);
    }
  }

  const client = readLab("my-list-next-client.tsx");
  assert.match(client, /mode === "visual" \?/);
  assert.match(client, /data-testid="display-mode-simple"/);
  assert.equal((client.match(/<WorkFacts /g) ?? []).length, 2);
});

test("exactly one suggested primary action exists at a time", () => {
  const classified = classifyWorks(MY_LIST_FIXTURES, NOW);
  const suggested = suggestNextWork(classified, "all");
  assert.ok(suggested);
  assert.equal(suggested.id, "ex-mujica");
  assert.equal(primaryActionFor(suggested).label, "確認済みの正規配信で見る");

  for (const filter of ["unwatched", "dormant", "expiring"] as const) {
    const next = suggestNextWork(classified, filter);
    assert.ok(next);
    const visible = filterWorks(classified, filter);
    assert.equal(visible.filter((work) => work.id === next.id).length, 1);
    assert.equal(visible.every((work) => work.state === filter), true);
  }

  assert.equal(suggestNextWork([], "all"), null);
  const keep = keepWatchingAction(suggested);
  assert.equal(keep.label, "見続ける");
  assert.equal(keep.workId, suggested.id);
});

test("lab CSS keeps 44px targets, visible focus, and reduced motion", () => {
  const css = readLab("my-list-next.module.css");
  const tapRule = css.match(
    /\.modeBtn,\s*\n\.chip,\s*\n\.primary,\s*\n\.secondary,\s*\n\.workSelect\s*\{([^}]*)\}/
  );
  assert.ok(tapRule, "shared tap-target rule must exist");
  assert.match(tapRule[1], /min-height:\s*44px/);
  assert.match(tapRule[1], /min-width:\s*44px/);

  assert.match(
    css,
    /\.modeBtn:focus-visible,\s*\n\.chip:focus-visible,\s*\n\.primary:focus-visible,\s*\n\.secondary:focus-visible,\s*\n\.workSelect:focus-visible\s*\{/
  );
  assert.match(css, /outline:\s*2px solid var\(--accent\)/);

  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(reduced, "reduced-motion rule must exist");
  assert.match(reduced[1], /transition:\s*none/);
});

test("lab copy stays Japanese, records culture-cycle, and avoids pressure", () => {
  const source = [
    readLab("page.tsx"),
    readLab("my-list-next-client.tsx"),
    readLab("model.ts"),
    readLab("fixtures.ts")
  ].join("\n");

  assert.match(source, /未消化/);
  assert.match(source, /長期放置/);
  assert.match(source, /配信終了間近/);
  assert.match(source, /文化循環チェック/);
  assert.match(source, /robots:\s*\{\s*index:\s*false/);
  assert.match(source, /キーボードの Enter で次の一手を完了できます/);
  assert.doesNotMatch(
    source,
    /ストリーク|ランキング|罪悪感|遅れています|忘れていません|連続ログイン/
  );
  assert.doesNotMatch(source, /from ["']@\/lib\/|from ["']@\/auth|fetch\(|oauth|turso/i);
});

test("lab relative imports keep Node-resolvable file extensions", () => {
  const source = [
    readLab("page.tsx"),
    readLab("my-list-next-client.tsx"),
    readLab("model.ts"),
    readLab("fixtures.ts")
  ].join("\n");

  assert.match(source, /from "\.\/model\.ts"/);
  assert.match(source, /from "\.\/fixtures\.ts"/);
  assert.match(source, /from "\.\/my-list-next-client\.tsx"/);
  assert.doesNotMatch(source, /from ["']\.\/(model|fixtures|my-list-next-client)["']/);
});
