import type { Metadata } from "next";
import { canonicalizeSeasonSearchParams } from "@/lib/season-url";
import { ImpressionsClient } from "./impressions-client";
import "./impressions.css";

export const metadata: Metadata = { title: "今期チェック — numanie", robots: { index: false, follow: false } };

export default async function ImpressionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const canonical = canonicalizeSeasonSearchParams(query);
  // The client canonicalizes history so the browser-only fragment is preserved.
  return <ImpressionsClient seasonKey={canonical.ref} resumeToken={typeof query.resume === "string" ? query.resume : null} />;
}
