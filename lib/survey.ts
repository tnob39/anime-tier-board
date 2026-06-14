import { getTursoClient } from "@/lib/turso";

// ─── 質問定義（フロント・バックで共有） ──────────────────────────────

export type SurveyQuestionId = "q1" | "q2" | "q3" | "q4" | "q5";

export type SurveyQuestion = {
  id: SurveyQuestionId;
  title: string;
  /** 複数選択可か */
  multi: boolean;
  options: { value: string; label: string }[];
};

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "q1",
    title: "ふだんアニメをどう見ますか？",
    multi: false,
    options: [
      { value: "realtime", label: "放送日にTVで見る（リアタイ派）" },
      { value: "subscription", label: "配信で後から見る（サブスク派）" },
      { value: "both", label: "両方" }
    ]
  },
  {
    id: "q2",
    title: "ホームを開いて最初に見たいのは？",
    multi: false,
    options: [
      { value: "catchup", label: "今すぐ見られる未視聴（配信済み）" },
      { value: "record", label: "自分の評価・記録" },
      { value: "tonight", label: "今夜の放送予定" },
      { value: "discover", label: "今期の注目・おすすめ" }
    ]
  },
  {
    id: "q3",
    title: "よく使いたい機能は？（複数可）",
    multi: true,
    options: [
      { value: "tracking", label: "視聴記録・ステータス管理" },
      { value: "tier", label: "Tier表・評価" },
      { value: "subscheck", label: "サブスクで見られるか確認" },
      { value: "calendar", label: "放映カレンダー" },
      { value: "analysis", label: "好み分析" }
    ]
  },
  {
    id: "q4",
    title: "今期は何本見ていますか？",
    multi: false,
    options: [
      { value: "none", label: "0本" },
      { value: "light", label: "1〜3本" },
      { value: "mid", label: "4〜9本" },
      { value: "heavy", label: "10本以上" }
    ]
  },
  {
    id: "q5",
    title: "加入しているサブスクは？（複数可）",
    multi: true,
    options: [
      { value: "netflix", label: "Netflix" },
      { value: "danime", label: "dアニメストア" },
      { value: "unext", label: "U-NEXT" },
      { value: "prime", label: "Amazon Prime" },
      { value: "other", label: "その他" },
      { value: "none", label: "なし" }
    ]
  }
];

// ─── 回答の型 ──────────────────────────────────────────────────────

export type SurveyAnswers = {
  q1?: string | null;
  q2?: string | null;
  q3?: string[];
  q4?: string | null;
  q5?: string[];
};

export type SurveyResults = {
  /** 総回答数（ユニーク回答者） */
  total: number;
  /** 質問ID -> 選択肢value -> 票数 */
  counts: Record<SurveyQuestionId, Record<string, number>>;
};

// ─── スキーマ ──────────────────────────────────────────────────────

let surveySchemaReady: Promise<void> | null = null;

export function ensureSurveySchema() {
  surveySchemaReady ??= (async () => {
    const client = getTursoClient();
    await client.execute(`create table if not exists survey_responses (
      respondent_id text primary key,
      user_id text,
      q1 text,
      q2 text,
      q3 text,
      q4 text,
      q5 text,
      created_at text not null,
      updated_at text not null
    )`);
  })();
  return surveySchemaReady;
}

// ─── 保存（1回答者1回答・再回答で上書き） ────────────────────────────

function isValidOption(qid: SurveyQuestionId, value: string): boolean {
  const q = SURVEY_QUESTIONS.find((item) => item.id === qid);
  return Boolean(q?.options.some((opt) => opt.value === value));
}

function sanitizeSingle(qid: SurveyQuestionId, value: unknown): string | null {
  if (typeof value !== "string") return null;
  return isValidOption(qid, value) ? value : null;
}

function sanitizeMulti(qid: SurveyQuestionId, value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && isValidOption(qid, v))
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

export async function saveSurveyResponse(input: {
  respondentId: string;
  userId?: string | null;
  answers: SurveyAnswers;
}): Promise<void> {
  await ensureSurveySchema();
  const now = new Date().toISOString();

  const q1 = sanitizeSingle("q1", input.answers.q1);
  const q2 = sanitizeSingle("q2", input.answers.q2);
  const q3 = sanitizeMulti("q3", input.answers.q3);
  const q4 = sanitizeSingle("q4", input.answers.q4);
  const q5 = sanitizeMulti("q5", input.answers.q5);

  await getTursoClient().execute({
    sql: `insert into survey_responses
            (respondent_id, user_id, q1, q2, q3, q4, q5, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(respondent_id) do update set
            user_id = excluded.user_id,
            q1 = excluded.q1, q2 = excluded.q2, q3 = excluded.q3,
            q4 = excluded.q4, q5 = excluded.q5,
            updated_at = excluded.updated_at`,
    args: [
      input.respondentId,
      input.userId ?? null,
      q1,
      q2,
      JSON.stringify(q3),
      q4,
      JSON.stringify(q5),
      now,
      now
    ]
  });
}

// ─── 集計 ──────────────────────────────────────────────────────────

function emptyCounts(): SurveyResults["counts"] {
  const counts = {} as SurveyResults["counts"];
  for (const q of SURVEY_QUESTIONS) {
    counts[q.id] = {};
    for (const opt of q.options) {
      counts[q.id][opt.value] = 0;
    }
  }
  return counts;
}

function parseArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function getSurveyResults(): Promise<SurveyResults> {
  await ensureSurveySchema();
  const result = await getTursoClient().execute(
    "select q1, q2, q3, q4, q5 from survey_responses"
  );

  const counts = emptyCounts();
  for (const row of result.rows) {
    for (const qid of ["q1", "q2", "q4"] as const) {
      const v = row[qid];
      if (typeof v === "string" && counts[qid][v] != null) {
        counts[qid][v] += 1;
      }
    }
    for (const qid of ["q3", "q5"] as const) {
      for (const v of parseArray(row[qid])) {
        if (counts[qid][v] != null) counts[qid][v] += 1;
      }
    }
  }

  return { total: result.rows.length, counts };
}
