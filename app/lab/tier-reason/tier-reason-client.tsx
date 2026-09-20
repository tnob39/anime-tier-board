"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  applyFixtureSave,
  canSubmitReason,
  COPY,
  CULTURE_CYCLE_CHECKS,
  fieldsLocked,
  FIXTURE_SAVE_DELAY_MS,
  isReasonOverLimit,
  LAB_ANIME_FIXTURES,
  meaningfulRatingRate,
  nextCreatorAction,
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
  type LabAnimeFixture,
  type LabDisplayMode,
  type PendingSave,
  type SaveStatus,
  type SavedReason,
  type SpoilerState,
  type Visibility,
} from "./tier-reason-model";
import "./tier-reason.css";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function TierReasonLabClient() {
  const [mode, setMode] = useState<LabDisplayMode>("visual");
  const [fixtureId, setFixtureId] = useState<LabAnimeFixture["id"]>("sourced");
  const [reason, setReason] = useState("");
  const [spoiler, setSpoiler] = useState<SpoilerState>("unspecified");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [failNext, setFailNext] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [saved, setSaved] = useState<SavedReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedReason[]>([]);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [ready, setReady] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef(pendingSave);
  const liveRef = useRef({ reason, spoiler, visibility, failNext });
  const statusRef = useRef(status);
  pendingRef.current = pendingSave;
  liveRef.current = { reason, spoiler, visibility, failNext };
  statusRef.current = status;

  useEffect(() => {
    setReady(true);
  }, []);

  const fixture = LAB_ANIME_FIXTURES[fixtureId];
  const locked = fieldsLocked(status);
  const canonicalReason = pendingSave?.rawReason ?? reason;
  const displayedSpoiler = pendingSave?.spoiler ?? spoiler;
  const displayedVisibility = pendingSave?.visibility ?? visibility;
  const displayedFailNext = pendingSave?.failNext ?? failNext;
  const overLimit = isReasonOverLimit(canonicalReason);
  const canSubmit = canSubmitReason(reason) && !locked;
  const statusText = saveStatusMessage(status, saved, error);
  const preview = previewFromDraft({
    rawReason: canonicalReason,
    spoiler: displayedSpoiler,
    visibility: displayedVisibility,
  });
  const reasonAria = reasonFieldAria(overLimit);
  const nextAction = nextCreatorAction(fixture.creator);
  const metric = meaningfulRatingRate(history);
  const primaryLabel = primaryActionLabel(status);

  const countText = useMemo(
    () => `${canonicalReason.length} / ${REASON_MAX_LENGTH}`,
    [canonicalReason.length]
  );

  function restorePendingControls() {
    const pending = pendingRef.current;
    const live = liveRef.current;
    const canonical = {
      rawReason: pending?.rawReason ?? live.reason,
      spoiler: pending?.spoiler ?? live.spoiler,
      visibility: pending?.visibility ?? live.visibility,
      failNext: pending?.failNext ?? live.failNext,
    };
    if (reasonRef.current) {
      restoreTextControl(reasonRef.current, canonical.rawReason);
    }
    const form = formRef.current;
    if (!form) return;
    restoreRadioGroup(
      form.querySelectorAll("input[name='lab-tr-spoiler']") as NodeListOf<HTMLInputElement>,
      canonical.spoiler
    );
    restoreRadioGroup(
      form.querySelectorAll("input[name='lab-tr-visibility']") as NodeListOf<HTMLInputElement>,
      canonical.visibility
    );
    const failBox = form.querySelector<HTMLInputElement>(
      '[data-testid="lab-tr-fail-next"]'
    );
    if (failBox) {
      failBox.checked = canonical.failNext;
    }
  }

  useLayoutEffect(() => {
    restorePendingControls();
  }, [pendingSave, reason, spoiler, visibility, failNext, status]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const revertIfLocked = () => {
      if (!fieldsLocked(statusRef.current) && !pendingRef.current) return;
      restorePendingControls();
    };
    form.addEventListener("input", revertIfLocked, true);
    form.addEventListener("change", revertIfLocked, true);
    return () => {
      form.removeEventListener("input", revertIfLocked, true);
      form.removeEventListener("change", revertIfLocked, true);
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const snapshot: PendingSave = {
      rawReason: reason,
      spoiler,
      visibility,
      failNext,
    };
    setPendingSave(snapshot);
    setStatus("saving");
    setError(null);
    await wait(FIXTURE_SAVE_DELAY_MS);

    const outcome = applyFixtureSave(snapshot);
    setFailNext(outcome.failNext);
    setPendingSave(null);

    if (!outcome.result.ok) {
      setStatus("error");
      setError(outcome.result.error);
      return;
    }

    const savedReason = outcome.result.saved;
    setSaved(savedReason);
    setHistory((current) => [...current, savedReason]);
    setStatus("saved");
  }

  return (
    <div
      className="lab-tr-page"
      data-display-mode={mode}
      data-save-status={status}
      data-visibility={displayedVisibility}
      data-spoiler={displayedSpoiler}
      data-ready={ready ? "true" : "false"}
    >
      <header className="lab-tr-panel">
        <p className="lab-tr-kicker">{COPY.kicker}</p>
        <h1 className="lab-tr-title">{COPY.title}</h1>
        <p className="lab-tr-lead">{COPY.lead}</p>
        <div className="lab-tr-mode" role="group" aria-label={COPY.modeLegend}>
          <button
            type="button"
            className="lab-tr-mode-btn"
            data-testid="lab-tr-mode-visual"
            aria-pressed={mode === "visual"}
            onClick={() => setMode("visual")}
          >
            {COPY.modeVisual}
          </button>
          <button
            type="button"
            className="lab-tr-mode-btn"
            data-testid="lab-tr-mode-simple"
            aria-pressed={mode === "simple"}
            onClick={() => setMode("simple")}
          >
            {COPY.modeSimple}
          </button>
        </div>
      </header>

      <section
        className="lab-tr-culture"
        data-testid="lab-tr-culture"
        data-culture-check="recorded"
        aria-labelledby="lab-tr-culture-heading"
      >
        <h2 className="lab-tr-heading" id="lab-tr-culture-heading">
          {COPY.cultureHeading}
        </h2>
        <ul className="lab-tr-culture-list">
          {CULTURE_CYCLE_CHECKS.map((item) => (
            <li
              key={item.id}
              className="lab-tr-culture-item"
              data-culture-item={item.id}
              data-result="pass"
            >
              <span className="lab-tr-culture-label">{item.label}</span>
              <span className="lab-tr-culture-result">{item.result}</span>
            </li>
          ))}
        </ul>
      </section>

      <article className="lab-tr-card" aria-labelledby="lab-tr-anime-title">
        <label className="lab-tr-label" htmlFor="lab-tr-fixture">
          {COPY.fixtureLabel}
        </label>
        <select
          id="lab-tr-fixture"
          className="lab-tr-select"
          data-testid="lab-tr-fixture"
          value={fixtureId}
          disabled={locked}
          onChange={(event) => {
            if (fieldsLocked(status)) return;
            setFixtureId(event.target.value as LabAnimeFixture["id"]);
            setStatus("idle");
            setError(null);
          }}
        >
          <option value="sourced">
            {LAB_ANIME_FIXTURES.sourced.titleJa}（出典あり）
          </option>
          <option value="unsourced">
            {LAB_ANIME_FIXTURES.unsourced.titleJa}（出典なし）
          </option>
        </select>
        <div className="lab-tr-title-row">
          <h2 className="lab-tr-anime-title" id="lab-tr-anime-title">
            {fixture.titleJa}
          </h2>
          {fixture.titleRomaji ? (
            <p className="lab-tr-romaji">{fixture.titleRomaji}</p>
          ) : null}
          <p className="lab-tr-tier">
            {COPY.tierLabel}: {fixture.tier}
          </p>
        </div>
        {mode === "visual" ? (
          <div
            className="lab-tr-poster"
            data-testid="lab-tr-poster"
            role="img"
            aria-label={`${fixture.titleJa}${COPY.posterLabel}`}
          />
        ) : null}
      </article>

      <form ref={formRef} className="lab-tr-form" onSubmit={onSubmit} noValidate>
        <label className="lab-tr-label" htmlFor="lab-tr-reason">
          {COPY.reasonLabel}
        </label>
        <textarea
          id="lab-tr-reason"
          ref={reasonRef}
          className="lab-tr-textarea"
          data-testid="lab-tr-reason"
          value={canonicalReason}
          disabled={locked}
          onChange={(event) => {
            if (pendingSave || fieldsLocked(status)) {
              restoreTextControl(event.target, canonicalReason);
              return;
            }
            setReason(event.target.value);
          }}
          placeholder={COPY.reasonPlaceholder}
          aria-required="false"
          aria-invalid={reasonAria.invalid}
          aria-describedby={reasonAria.describedBy}
          aria-errormessage={reasonAria.errorMessage}
        />
        <p className="lab-tr-hint" id={REASON_HINT_ID}>
          {COPY.reasonHint}
        </p>
        <p
          className="lab-tr-count"
          id={REASON_COUNT_ID}
          data-over={overLimit ? "true" : "false"}
        >
          {countText}
        </p>
        {overLimit ? (
          <p
            className="lab-tr-reason-error"
            id={REASON_ERROR_ID}
            data-testid="lab-tr-reason-error"
            role="alert"
            aria-live="assertive"
          >
            {COPY.overLimit}
          </p>
        ) : null}

        <fieldset className="lab-tr-choices">
          <legend className="lab-tr-legend">{COPY.spoilerLegend}</legend>
          <label className="lab-tr-choice">
            <input
              type="radio"
              name="lab-tr-spoiler"
              value="unspecified"
              checked={displayedSpoiler === "unspecified"}
              disabled={locked}
              onChange={() => {
                if (pendingSave || fieldsLocked(status)) {
                  restorePendingControls();
                  return;
                }
                setSpoiler("unspecified");
              }}
            />
            {COPY.spoilerUnspecified}
          </label>
          <label className="lab-tr-choice">
            <input
              type="radio"
              name="lab-tr-spoiler"
              value="has_spoiler"
              checked={displayedSpoiler === "has_spoiler"}
              disabled={locked}
              onChange={() => {
                if (pendingSave || fieldsLocked(status)) {
                  restorePendingControls();
                  return;
                }
                setSpoiler("has_spoiler");
              }}
            />
            {COPY.spoilerYes}
          </label>
          <label className="lab-tr-choice">
            <input
              type="radio"
              name="lab-tr-spoiler"
              value="no_spoiler"
              checked={displayedSpoiler === "no_spoiler"}
              disabled={locked}
              onChange={() => {
                if (pendingSave || fieldsLocked(status)) {
                  restorePendingControls();
                  return;
                }
                setSpoiler("no_spoiler");
              }}
            />
            {COPY.spoilerNo}
          </label>
        </fieldset>

        <fieldset className="lab-tr-choices">
          <legend className="lab-tr-legend">{COPY.visibilityLegend}</legend>
          <label className="lab-tr-choice">
            <input
              type="radio"
              name="lab-tr-visibility"
              value="private"
              checked={displayedVisibility === "private"}
              disabled={locked}
              onChange={() => {
                if (pendingSave || fieldsLocked(status)) {
                  restorePendingControls();
                  return;
                }
                setVisibility("private");
              }}
            />
            {COPY.visibilityPrivate}
          </label>
          <label className="lab-tr-choice">
            <input
              type="radio"
              name="lab-tr-visibility"
              value="shared"
              checked={displayedVisibility === "shared"}
              disabled={locked}
              onChange={() => {
                if (pendingSave || fieldsLocked(status)) {
                  restorePendingControls();
                  return;
                }
                setVisibility("shared");
              }}
            />
            {COPY.visibilityShared}
          </label>
        </fieldset>

        <label className="lab-tr-check">
          <input
            type="checkbox"
            data-testid="lab-tr-fail-next"
            checked={displayedFailNext}
            disabled={locked}
            onChange={(event) => {
              if (pendingSave || fieldsLocked(status)) {
                restorePendingControls();
                return;
              }
              setFailNext(event.target.checked);
            }}
          />
          {COPY.failNext}
        </label>

        <button
          type="submit"
          className="lab-tr-primary"
          data-testid="lab-tr-save"
          disabled={!canSubmit}
        >
          {primaryLabel}
        </button>

        {statusText ? (
          <p
            className="lab-tr-status"
            data-testid="lab-tr-status"
            data-tone={status === "error" ? "error" : status}
            role={status === "error" ? "alert" : "status"}
            aria-live={status === "error" ? "assertive" : "polite"}
          >
            {statusText}
          </p>
        ) : null}

        <section aria-labelledby="lab-tr-preview-heading">
          <h3 className="lab-tr-heading" id="lab-tr-preview-heading">
            {COPY.sharePreviewHeading}
          </h3>
          <p data-testid="lab-tr-share-preview">{preview.label}</p>
          {preview.body ? (
            <p className="lab-tr-preview-body" data-testid="lab-tr-share-body">
              {preview.body}
            </p>
          ) : null}
        </section>

        {saved ? (
          <section aria-labelledby="lab-tr-original-heading">
            <h3 className="lab-tr-heading" id="lab-tr-original-heading">
              {COPY.savedOriginalHeading}
            </h3>
            <p className="lab-tr-original" data-testid="lab-tr-saved-reason">
              {saved.text ?? COPY.savedOriginalNone}
            </p>
          </section>
        ) : null}

        <section aria-labelledby="lab-tr-next-heading">
          <h3 className="lab-tr-heading" id="lab-tr-next-heading">
            {COPY.nextHeading}
          </h3>
          <p className="lab-tr-next-name" data-testid="lab-tr-next">
            {nextAction.kind === "creator"
              ? `${nextAction.label}: ${nextAction.nameJa}`
              : nextAction.label}
          </p>
          {nextAction.kind === "creator" && nextAction.sourceLabel ? (
            <p className="lab-tr-source">出典: {nextAction.sourceLabel}</p>
          ) : (
            <p className="lab-tr-next-hint">{COPY.nextUnavailableHint}</p>
          )}
        </section>

        <p className="lab-tr-metric" data-testid="lab-tr-metric">
          {COPY.metricLabel}: {metric.withReason}/{metric.total}
        </p>
        <p className="lab-tr-metric-hint">{COPY.metricHint}</p>
      </form>
    </div>
  );
}
