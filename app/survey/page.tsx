import type { Metadata } from "next";
import { getSurveyResults } from "@/lib/survey";
import { SurveyClient } from "./survey-client";

// 集計を毎回DBから取得するため動的レンダリング（ビルド時の静的生成を無効化）
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "サービス改善アンケート — numanie",
  description: "numanie をもっと使いやすくするためのアンケートです。"
};

export default async function SurveyPage() {
  const initialResults = await getSurveyResults();
  return <SurveyClient initialTotal={initialResults.total} />;
}
