import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyFixtureSave,
  canSubmitReason,
  COPY,
  CULTURE_CYCLE_CHECKS,
  fieldsLocked,
  isReasonOverLimit,
  LAB_ANIME_FIXTURES,
  meaningfulRatingRate,
  nextCreatorAction,
  normalizeReason,
  previewFromDraft,
  primaryActionLabel,
  REASON_COUNT_ID,
  REASON_ERROR_ID,
  REASON_HINT_ID,
  REASON_MAX_LENGTH,
  reasonFieldAria,
  restoreRadioGroup,
  restoreTextControl,
  saveStatusMessage,
  sharePreview,
} from "../../app/lab/tier-reason/tier-reason-model.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");

function readLab(relativePath: string): string {
  return readFileSync(path.join(projectRoot, "app/lab/tier-reason", relativePath), "utf8");
}

const css = readLab("tier-reason.css");
const client = readLab("tier-reason-client.tsx");
const page = readLab("page.tsx");
const model = readLab("tier-reason-model.ts");

test("optional and no-reason normalize to null without rewriting user text", () => {
  assert.equal(normalizeReason(""), null);
  assert.equal(normalizeReason("   \n\t  "), null);
  assert.equal(normalizeReason("  間の静けさが好き  "), "間の静けさが好き");
  assert.equal(normalizeReason("画面の空気が好き"), "画面の空気が好き");
  assert.equal(canSubmitReason(""), true);
  assert.equal(canSubmitReason("   "), true);
});

test("over-limit reason cannot submit and does not invent a shortened substitute", () => {
  const tooLong = "あ".repeat(REASON_MAX_LENGTH + 1);
  assert.equal(isReasonOverLimit(tooLong), true);
  assert.equal(canSubmitReason(tooLong), false);
  const blocked = applyFixtureSave({
    rawReason: tooLong,
    spoiler: "unspecified",
    visibility: "private",
    failNext: false,
  });
  assert.equal(blocked.status, "error");
  assert.equal(blocked.result.ok, false);
  if (!blocked.result.ok) {
    assert.equal(blocked.result.error, COPY.overLimit);
  }

  const invalid = reasonFieldAria(true);
  assert.equal(invalid.invalid, "true");
  assert.equal(invalid.errorMessage, REASON_ERROR_ID);
  assert.equal(
    invalid.describedBy,
    `${REASON_HINT_ID} ${REASON_COUNT_ID} ${REASON_ERROR_ID}`
  );
  const valid = reasonFieldAria(false);
  assert.equal(valid.invalid, "false");
  assert.equal(valid.errorMessage, undefined);
  assert.doesNotMatch(valid.describedBy, new RegExp(REASON_ERROR_ID));

  assert.match(client, /aria-invalid=\{reasonAria\.invalid\}/);
  assert.match(client, /aria-errormessage=\{reasonAria\.errorMessage\}/);
  assert.match(client, /id=\{REASON_ERROR_ID\}/);
  assert.match(client, /role="alert"/);
  assert.match(client, /aria-live="assertive"/);
  assert.match(client, /data-testid="lab-tr-reason-error"/);
});

test("spoiler and private default hide share-surface body until explicit no-spoiler share", () => {
  const text = "最終話の会話が好き";
  const privateDefault = sharePreview({
    text,
    spoiler: "no_spoiler",
    visibility: "private",
  });
  assert.equal(privateDefault.hidden, true);
  assert.equal(privateDefault.body, null);
  assert.equal(privateDefault.label, COPY.shareHiddenPrivate);

  const unspecified = sharePreview({
    text,
    spoiler: "unspecified",
    visibility: "shared",
  });
  assert.equal(unspecified.hidden, true);
  assert.equal(unspecified.body, null);
  assert.equal(unspecified.label, COPY.shareHiddenSpoiler);

  const spoilerOn = sharePreview({
    text,
    spoiler: "has_spoiler",
    visibility: "shared",
  });
  assert.equal(spoilerOn.hidden, true);
  assert.equal(spoilerOn.body, null);

  const visible = sharePreview({
    text,
    spoiler: "no_spoiler",
    visibility: "shared",
  });
  assert.equal(visible.hidden, false);
  assert.equal(visible.body, text);
});

test("pending save snapshot stays consistent even if later form values change", () => {
  assert.equal(fieldsLocked("saving"), true);
  assert.equal(fieldsLocked("idle"), false);
  assert.equal(fieldsLocked("saved"), false);
  assert.equal(fieldsLocked("error"), false);

  const snapshot = {
    rawReason: "画面の空気が好き",
    spoiler: "no_spoiler" as const,
    visibility: "shared" as const,
    failNext: false,
  };
  const pendingPreview = previewFromDraft(snapshot);
  assert.equal(pendingPreview.hidden, false);
  assert.equal(pendingPreview.body, "画面の空気が好き");

  const mutatedPreview = previewFromDraft({
    rawReason: "書き換え",
    spoiler: "has_spoiler",
    visibility: "private",
  });
  assert.equal(mutatedPreview.hidden, true);
  assert.equal(mutatedPreview.label, COPY.shareHiddenPrivate);

  const savedFromSnapshot = applyFixtureSave(snapshot);
  assert.equal(savedFromSnapshot.status, "saved");
  if (savedFromSnapshot.result.ok) {
    assert.equal(savedFromSnapshot.result.saved.text, "画面の空気が好き");
    assert.equal(savedFromSnapshot.result.saved.spoiler, "no_spoiler");
    assert.equal(savedFromSnapshot.result.saved.visibility, "shared");
  }

  const field = { value: "書き換え" };
  restoreTextControl(field, snapshot.rawReason);
  assert.equal(field.value, snapshot.rawReason);
  const radios = [
    { value: "unspecified", checked: false },
    { value: "has_spoiler", checked: true },
    { value: "no_spoiler", checked: false },
  ];
  restoreRadioGroup(radios, "no_spoiler");
  assert.deepEqual(
    radios.map((item) => item.checked),
    [false, false, true]
  );

  assert.match(client, /disabled=\{locked\}/);
  assert.match(client, /setPendingSave\(snapshot\)/);
  assert.match(client, /applyFixtureSave\(snapshot\)/);
  assert.match(client, /value=\{canonicalReason\}/);
  assert.match(client, /useLayoutEffect/);
  assert.match(client, /addEventListener\("input", revertIfLocked, true\)/);
  assert.match(client, /restoreTextControl\(event\.target, canonicalReason\)/);
  assert.match(client, /failBox\.checked = canonical\.failNext/);
  assert.match(client, /checked=\{displayedFailNext\}/);
});

test("save state transitions include retryable fixture error and keep user text", () => {
  assert.equal(primaryActionLabel("idle"), COPY.save);
  assert.equal(primaryActionLabel("saving"), COPY.saving);
  assert.equal(primaryActionLabel("error"), COPY.retry);
  assert.equal(primaryActionLabel("saved"), COPY.save);

  const failed = applyFixtureSave({
    rawReason: "間の静けさが好き",
    spoiler: "unspecified",
    visibility: "private",
    failNext: true,
  });
  assert.equal(failed.failNext, false);
  assert.equal(failed.status, "error");
  assert.equal(failed.result.ok, false);
  assert.equal(saveStatusMessage("error", null, COPY.saveFailed), COPY.saveFailed);

  const retried = applyFixtureSave({
    rawReason: "間の静けさが好き",
    spoiler: "unspecified",
    visibility: "private",
    failNext: failed.failNext,
  });
  assert.equal(retried.status, "saved");
  assert.equal(retried.result.ok, true);
  if (retried.result.ok) {
    assert.equal(retried.result.saved.text, "間の静けさが好き");
    assert.equal(retried.result.saved.visibility, "private");
    assert.equal(retried.result.saved.spoiler, "unspecified");
    assert.equal(
      saveStatusMessage("saved", retried.result.saved, null),
      COPY.savedWithReason
    );
  }

  const noReason = applyFixtureSave({
    rawReason: "   ",
    spoiler: "unspecified",
    visibility: "private",
    failNext: false,
  });
  assert.equal(noReason.status, "saved");
  if (noReason.result.ok) {
    assert.equal(noReason.result.saved.text, null);
    assert.equal(
      saveStatusMessage("saved", noReason.result.saved, null),
      COPY.savedWithoutReason
    );
  }
});

test("culture-cycle next action is one sourced creator or unavailable, never guessed", () => {
  const sourced = nextCreatorAction(LAB_ANIME_FIXTURES.sourced.creator);
  assert.equal(sourced.kind, "creator");
  assert.equal(sourced.nameJa, "マッドハウス");
  assert.match(sourced.label, /スタジオを見る/);

  const missing = nextCreatorAction(LAB_ANIME_FIXTURES.unsourced.creator);
  assert.equal(missing.kind, "unavailable");
  assert.equal(missing.label, COPY.nextUnavailable);
  assert.equal(missing.nameJa, null);

  const metric = meaningfulRatingRate([
    {
      text: null,
      spoiler: "unspecified",
      visibility: "private",
      savedAt: "2026-09-20T00:00:00.000Z",
    },
    {
      text: "間の静けさが好き",
      spoiler: "unspecified",
      visibility: "private",
      savedAt: "2026-09-20T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(metric, { withReason: 1, total: 2 });
  assert.equal(CULTURE_CYCLE_CHECKS.length, 8);
});

test("lab CSS is scoped, 44px, focused, and reduced-motion safe", () => {
  assert.match(css, /\.lab-tr-page\s*\{/);
  const classSelectors =
    css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.[A-Za-z_][\w-]*/g) ?? [];
  assert.ok(classSelectors.length > 0, "scoped lab classes must exist");
  for (const selector of classSelectors) {
    assert.ok(
      selector.startsWith(".lab-tr-"),
      `lab CSS class must stay scoped: ${selector}`
    );
  }
  assert.match(
    css,
    /\.lab-tr-mode-btn,\s*\n\.lab-tr-primary,\s*\n\.lab-tr-choice,\s*\n\.lab-tr-check,\s*\n\.lab-tr-select\s*\{/
  );
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(
    css,
    /\.lab-tr-page :is\(button, a, input, textarea, select, \[tabindex\]\):focus-visible/
  );
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media \(min-width:\s*720px\)/);
});

test("lab source stays fixture-only: Japanese UI, no AI completion, no production API", () => {
  const combined = `${page}\n${client}\n${model}`;
  assert.match(combined, /理由付き評価/);
  assert.match(combined, /非公開（既定）/);
  assert.match(combined, /AIによる補完・要約・美化はしません/);
  assert.match(client, /className="lab-tr-primary"/);
  assert.equal((client.match(/className="lab-tr-primary"/g) ?? []).length, 1);
  assert.doesNotMatch(combined, /fetch\(/);
  assert.doesNotMatch(combined, /openai|anthropic|summarize|completeReason|suggestReason/i);
  assert.doesNotMatch(combined, /生成する|補完する|要約する/);
  assert.doesNotMatch(combined, /\/api\//);
  assert.match(page, /robots:\s*\{\s*index:\s*false/);
  assert.match(client, /data-testid="lab-tr-mode-visual"/);
  assert.match(client, /data-testid="lab-tr-mode-simple"/);
});
