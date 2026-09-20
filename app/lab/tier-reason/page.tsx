import type { Metadata } from "next";
import { TierReasonLabClient } from "./tier-reason-client";

export const metadata: Metadata = {
  title: "理由付き評価 Lab — numanie",
  description: "Tier配置後の任意理由・ネタバレ制御・保存状態の検証用モック",
  robots: { index: false },
};

export default function LabTierReasonPage() {
  return <TierReasonLabClient />;
}
