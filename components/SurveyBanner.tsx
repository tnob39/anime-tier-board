"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const DONE_KEY = "numanie:survey:done";

/**
 * ホーム上部のアンケート募集バナー。
 * 回答済み（localStorage）の場合は表示しない。匿名で回答可能。
 */
export function SurveyBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(DONE_KEY)) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <Link href="/survey" className="survey-banner">
      <span className="survey-banner-icon" aria-hidden="true">
        📋
      </span>
      <span className="survey-banner-text">
        <strong>30秒アンケートに回答</strong>
        <span>あなたの使い方を教えてください。みんなの結果も見られます</span>
      </span>
      <span className="survey-banner-arrow" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
