import type { Metadata } from "next";
import { FeedbackClient } from "./feedback-client";

export const metadata: Metadata = {
  title: "利用者の声 — numanie",
  description: "匿名で要望・改善アイデアを送れます。ログイン不要です。",
};

export default function FeedbackPage() {
  return <FeedbackClient />;
}
