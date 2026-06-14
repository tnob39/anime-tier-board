"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SURVEY_QUESTIONS,
  type SurveyAnswers,
  type SurveyQuestionId,
  type SurveyResults
} from "@/lib/survey";

const DONE_KEY = "numanie:survey:done";
const RID_KEY = "numanie:survey:rid";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SurveyClient({ initialTotal }: { initialTotal: number }) {
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [rid, setRid] = useState("");

  useEffect(() => {
    let id = localStorage.getItem(RID_KEY);
    if (!id) {
      id = makeId();
      localStorage.setItem(RID_KEY, id);
    }
    setRid(id);

    if (localStorage.getItem(DONE_KEY)) {
      setSubmitted(true);
      void (async () => {
        const res = await fetch("/api/survey");
        if (res.ok) setResults((await res.json()) as SurveyResults);
      })();
    }
  }, []);

  function setSingle(qid: SurveyQuestionId, value: string) {
    setAnswers((a) => ({ ...a, [qid]: a[qid] === value ? null : value }));
  }

  function toggleMulti(qid: SurveyQuestionId, value: string) {
    setAnswers((a) => {
      const cur = (a[qid] as string[] | undefined) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...a, [qid]: next };
    });
  }

  function isSelected(qid: SurveyQuestionId, value: string): boolean {
    const v = answers[qid];
    return Array.isArray(v) ? v.includes(value) : v === value;
  }

  const hasAnyAnswer = SURVEY_QUESTIONS.some((q) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });

  async function submit() {
    if (!rid || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respondentId: rid, answers })
      });
      if (res.ok) {
        setResults((await res.json()) as SurveyResults);
        localStorage.setItem(DONE_KEY, "1");
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <main className="app-main survey-main">
        <header className="survey-header">
          <h1>ご協力ありがとうございました</h1>
          <p>みんなの回答（{results?.total ?? initialTotal}人）</p>
        </header>
        {results ? (
          <SurveyResultsView results={results} />
        ) : (
          <div className="survey-loading">
            <Loader2 className="spin" size={20} />
            <span>集計を読み込み中…</span>
          </div>
        )}
        <Link className="command-button emphasis-button survey-back" href="/">
          ホームに戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="app-main survey-main">
      <header className="survey-header">
        <p className="eyebrow">30秒アンケート</p>
        <h1>サービス改善アンケート</h1>
        <p>
          numanie をもっと使いやすくするために、あなたの使い方を教えてください。
          回答するとみんなの結果が見られます。
        </p>
        <p className="survey-count">現在 {initialTotal} 人が回答</p>
      </header>

      <div className="survey-questions">
        {SURVEY_QUESTIONS.map((q) => (
          <section key={q.id} className="survey-q">
            <h2>
              {q.title}
              {q.multi ? <span className="survey-multi-tag">複数可</span> : null}
            </h2>
            <div className="survey-options">
              {q.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`survey-opt${isSelected(q.id, opt.value) ? " is-selected" : ""}`}
                  onClick={() =>
                    q.multi ? toggleMulti(q.id, opt.value) : setSingle(q.id, opt.value)
                  }
                  aria-pressed={isSelected(q.id, opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        className="command-button emphasis-button survey-submit"
        disabled={!hasAnyAnswer || loading}
        onClick={() => void submit()}
      >
        {loading ? <Loader2 className="spin" size={18} /> : null}
        <span>回答する</span>
      </button>
      <p className="survey-note">回答は匿名です。いつでも結果を確認できます。</p>
    </main>
  );
}

function SurveyResultsView({ results }: { results: SurveyResults }) {
  return (
    <div className="survey-results">
      {SURVEY_QUESTIONS.map((q) => {
        const qCounts = results.counts[q.id];
        // 単一回答は total、複数回答は「その質問に1つ以上答えた人数」を母数にすると100%超になるため
        // 表示は各選択肢の票数 / 総回答者数(total) を割合とする。
        const denom = Math.max(1, results.total);
        return (
          <section key={q.id} className="survey-result-q">
            <h3>{q.title}</h3>
            <ul>
              {q.options.map((opt) => {
                const c = qCounts[opt.value] ?? 0;
                const pct = Math.round((c / denom) * 100);
                return (
                  <li key={opt.value} className="survey-result-row">
                    <div className="survey-result-label">
                      <span>{opt.label}</span>
                      <strong>
                        {c} <span>({pct}%)</span>
                      </strong>
                    </div>
                    <div className="survey-result-bar">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
