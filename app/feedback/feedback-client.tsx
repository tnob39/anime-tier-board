"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_BODY_MIN,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_LEVEL_LABELS,
  FEEDBACK_LEVELS,
  type FeedbackLevel,
} from "@/lib/feedback-shared";

type SubmitState = "idle" | "submitting" | "success" | "error";

const LEVEL_OPTIONS = FEEDBACK_LEVELS.map((value) => ({
  value,
  label: FEEDBACK_LEVEL_LABELS[value],
}));

export function FeedbackClient() {
  const [level, setLevel] = useState<FeedbackLevel>("improvement");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const bodyLength = body.trim().length;
  const bodyHint = useMemo(() => {
    if (bodyLength === 0) {
      return `${FEEDBACK_BODY_MIN}〜${FEEDBACK_BODY_MAX}文字`;
    }
    return `${bodyLength} / ${FEEDBACK_BODY_MAX}文字`;
  }, [bodyLength]);

  const canSubmit =
    agreed &&
    submitState !== "submitting" &&
    bodyLength >= FEEDBACK_BODY_MIN &&
    bodyLength <= FEEDBACK_BODY_MAX;

  function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setErrorMessage(null);
    if (!file) {
      setImageFile(null);
      return;
    }
    if (file.size > FEEDBACK_IMAGE_MAX_BYTES) {
      setImageFile(null);
      event.target.value = "";
      setErrorMessage("画像は3MB以下にしてください。");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (file.type && !allowed.includes(file.type)) {
      setImageFile(null);
      event.target.value = "";
      setErrorMessage("画像は JPEG / PNG / WebP のみ対応しています。");
      return;
    }
    setImageFile(file);
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
      if (imageFile) {
        formData.set("image", imageFile);
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
      setImageFile(null);
      setAgreed(false);
      setHoneypot("");
    } catch {
      setSubmitState("error");
      setErrorMessage(
        "送信に失敗しました。通信環境を確認して再度お試しください。"
      );
    }
  }

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
            />
            <span className="feedback-hint">{bodyHint}</span>
          </label>

          <label className="feedback-field">
            <span className="feedback-label">画像（任意・1枚）</span>
            <input
              className="feedback-file"
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              onChange={onImageChange}
            />
            <span className="feedback-hint">
              JPEG / PNG / WebP・最大 3MB。位置情報などのメタデータはサーバーで除去します。
            </span>
            {imageFile ? (
              <span className="feedback-file-name">選択中: 画像 1 枚</span>
            ) : null}
          </label>

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
          >
            {submitState === "submitting" ? "送信中…" : "匿名で送信する"}
          </button>
        </form>
      )}
    </main>
  );
}
