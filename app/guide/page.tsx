import type { Metadata } from "next";
import { GuideClient } from "./guide-client";

export const metadata: Metadata = {
  title: "使い方 | numanie",
};

export default function GuidePage() {
  return <GuideClient />;
}
