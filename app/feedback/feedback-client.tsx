"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import {
  formatFeedbackImageBytes,
  prepareFeedbackImageForUpload,
} from "@/lib/feedback-image-compress";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_BODY_MIN,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_IMAGE_SELECT_MAX_BYTES,
  FEEDBACK_LEVEL_LABELS,
  FEEDBACK_LEVELS,
  type FeedbackLevel,
} from "@/lib/feedback-shared";

type SubmitState = "idle" | "submitting" | "success" | "error";
type ImagePrepState = "idle" | "compressing" | "ready";

type PreparedImage = {
  file: File;
  originalBytes: number;
  outputBytes: number;
  compressed: boolean;
};

const LEVEL_OPTIONS = FEEDBACK_LEVELS.map((value) => ({
  value,
  label: FEEDBACK_LEVEL_LABELS[value],
}));

export function FeedbackClient() {
  const [level, setLevel] = useState<FeedbackLevel>("improvement");
  const [body, setBody] = useState("");
  const [preparedImage, setPreparedImage] = useState<PreparedImage | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);
  const [imagePrepState, setImagePrepState] = useState<ImagePrepState>("idle");
  const [honeypot, setHoneypot] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageRequestIdRef = useRef(0);

  const bodyLength = body.trim().length;
  const bodyHint = useMemo(() => {
    if (bodyLength === 0) {
      return `${FEEDBACK_BODY_MIN}〜${FEEDBACK_BODY_MAX}文字`;
    }
    return `${bodyLength} / ${FEEDBACK_BODY_MAX}文字`;
  }, [bodyLength]);

  const isCompressing = imagePrepState === "compressing";
  const canSubmit =
    agreed &&
    submitState !== "submitting" &&
    !isCompressing &&
    bodyLength >= FEEDBACK_BODY_MIN &&
    bodyLength <= FEEDBACK_BODY_MAX;

  const disabledReason = (() => {
    if (submitState === "submitting") return "送信中です。";
    if (isCompressing) return "画像の圧縮完了をお待ちください。";
    if (bodyLength < FEEDBACK_BODY_MIN) {
      return `内容をあと${FEEDBACK_BODY_MIN - bodyLength}文字入力してください。`;
    }
    if (bodyLength > FEEDBACK_BODY_MAX) {
      return `内容を${FEEDBACK_BODY_MAX}文字以内にしてください。`;
    }
    if (!agreed) return "公開についての確認にチェックしてください。";
    return null;
  })();

  function clearImageSelection() {
    imageRequestIdRef.current += 1;
    setPreparedImage(null);
    setSelectedImageName(null);
    setImagePrepState("idle");
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  async function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setErrorMessage(null);

    if (!file) {
      clearImageSelection();
      return;
    }

    const requestId = imageRequestIdRef.current + 1;
    imageRequestIdRef.current = requestId;
    setSelectedImageName(file.name);
    setPreparedImage(null);
    setImagePrepState("compressing");

    const result = await prepareFeedbackImageForUpload(file);

    if (imageRequestIdRef.current !== requestId) {
      return;
    }

    if (!result.ok) {
      setPreparedImage(null);
      setSelectedImageName(null);
      setImagePrepState("idle");
      setErrorMessage(result.error);
      event.target.value = "";
      return;
    }

    setPreparedImage({
      file: result.file,
      originalBytes: result.originalBytes,
      outputBytes: result.outputBytes,
      compressed: result.compressed,
    });
    setImagePrepState("ready");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSubmitState("submitting");
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("level", level);
      formData.set("body", body);
      formData.set(FEEDBACK_HONEYPOT_FIELD, honeypot);
      if (preparedImage) {
        formData.set("image", preparedImage.file);
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = "送信に失敗しました。時間をおいて再度お試しください。";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) {
            message = payload.error;
          }
        } catch {
          // keep default
        }
        setSubmitState("error");
        setErrorMessage(message);
        return;
      }

      setSubmitState("success");
      setBody("");
      clearImageSelection();
      setAgreed(false);
      setHoneypot("");
    } catch {
      setSubmitState("error");
      setErrorMessage(
        "送信に失敗しました。通信環境を確認して再度お試しください。"
      );
    }
  }

  const imageStatusText = (() => {
    if (isCompressing) {
      return selectedImageName
        ? `${selectedImageName} を圧縮しています…`
        : "画像を圧縮しています…";
    }
    if (!preparedImage) {
      return null;
    }
    const original = formatFeedbackImageBytes(preparedImage.originalBytes);
    const output = formatFeedbackImageBytes(preparedImage.outputBytes);
    if (preparedImage.compressed) {
      return `選択中: ${selectedImageName}（圧縮 ${original} → ${output}）`;
    }
    return `選択中: ${selectedImageName}（${output}）`;
  })();

  return (
    <main className="app-main feedback-main">
      <header className="feedback-header">
        <Link href="/" className="feedback-back">
          ← ホームへ
        </Link>
        <p className="eyebrow">フィードバック</p>
        <h1>利用者の声</h1>
        <p>
          ログイン不要・匿名で要望を送れます。氏名やメールアドレスの入力は不要です。
        </p>
      </header>

      {submitState === "success" ? (
        <section className="feedback-panel feedback-success" role="status">
          <h2>送信しました</h2>
          <p>
            ご協力ありがとうございます。内容は確認のうえ、GitHub Issues
            として公開される場合があります。
          </p>
          <button
            type="button"
            className="command-button"
            onClick={() => setSubmitState("idle")}
          >
            続けて送る
          </button>
        </section>
      ) : (
        <form className="feedback-panel feedback-form" onSubmit={onSubmit} noValidate>
          <div className="feedback-notice" role="note">
            <p>
              <strong>公開について:</strong>
              送信内容は GitHub Issues で公開される場合があります。
            </p>
            <p>
              <strong>個人情報:</strong>
              氏名・連絡先・住所・学校名など、あなたや第三者を特定できる情報は本文・画像に含めないでください。
            </p>
          </div>

          <label className="feedback-field">
            <span className="feedback-label">要望レベル</span>
            <select
              className="feedback-select"
              name="level"
              value={level}
              onChange={(e) => setLevel(e.target.value as FeedbackLevel)}
              required
              disabled={submitState === "submitting" || isCompressing}
            >
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="feedback-field">
            <span className="feedback-label">内容</span>
            <textarea
              className="feedback-textarea"
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              minLength={FEEDBACK_BODY_MIN}
              maxLength={FEEDBACK_BODY_MAX}
              placeholder="改善してほしい点や困っていることを書いてください（個人情報は書かないでください）"
              required
              disabled={submitState === "submitting" || isCompressing}
            />
            <span className="feedback-hint">{bodyHint}</span>
          </label>

          <div className="feedback-field">
            <label className="feedback-label" htmlFor="feedback-image">
              画像（任意・1枚）
            </label>
            <input
              id="feedback-image"
              ref={imageInputRef}
              className="feedback-file"
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              onChange={onImageChange}
              disabled={submitState === "submitting"}
            />
            <span className="feedback-hint">
              画像を添付しなくても送信できます。JPEG / PNG / WebP・最大{" "}
              {formatFeedbackImageBytes(FEEDBACK_IMAGE_SELECT_MAX_BYTES)}
              。3MB超は端末内で自動圧縮してから送信します（元画像は送りません）。位置情報などのメタデータはサーバーで除去します。
            </span>
            {imageStatusText ? (
              <div className="feedback-file-selection">
                <span className="feedback-file-name" role="status" aria-live="polite">
                  {imageStatusText}
                </span>
                <button
                  type="button"
                  className="feedback-remove-image"
                  onClick={clearImageSelection}
                  disabled={submitState === "submitting"}
                  aria-label={`${selectedImageName ?? "選択した画像"}を削除`}
                >
                  画像を削除
                </button>
              </div>
            ) : null}
          </div>

          {/* honeypot: 視覚的に隠す。ラベルも曖昧に。 */}
          <div className="feedback-honeypot" aria-hidden="true">
            <label>
              会社名
              <input
                type="text"
                name={FEEDBACK_HONEYPOT_FIELD}
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>

          <label className="feedback-agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={submitState === "submitting" || isCompressing}
            />
            <span>
              GitHub Issues で公開される可能性があること、個人情報を含めていないことを確認しました。
            </span>
          </label>

          {errorMessage ? (
            <p className="feedback-error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="command-button feedback-submit"
            disabled={!canSubmit}
            aria-describedby={disabledReason ? "feedback-disabled-reason" : undefined}
          >
            {isCompressing
              ? "圧縮中…"
              : submitState === "submitting"
                ? "送信中…"
                : "匿名で送信する"}
          </button>
          <p
            id="feedback-disabled-reason"
            className="feedback-hint feedback-disabled-reason"
            aria-live="polite"
          >
            {disabledReason ?? "送信できます。"}
          </p>
        </form>
      )}
    </main>
  );
}
